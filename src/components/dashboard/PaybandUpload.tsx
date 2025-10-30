import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import { Upload } from "lucide-react";

export const PaybandUpload = () => {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const { toast } = useToast();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      toast({ title: "Please select a file", variant: "destructive" });
      return;
    }

    setUploading(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];

      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
      
      // First row contains country names, second row contains Bottom/Midpoint/Top
      const countryRow = jsonData[0];
      const typeRow = jsonData[1];
      
      // Data starts from row 3 (index 2)
      const dataRows = jsonData.slice(2);

      const records = [];
      
      // Process each level row
      for (const row of dataRows) {
        if (!row[0]) continue; // Skip empty rows
        
        const level = row[0]; // Meliore Grading level
        
        // Process each country (every 3 columns: Bottom, Midpoint, Top)
        for (let i = 1; i < countryRow.length; i += 3) {
          const country = countryRow[i];
          if (!country) continue;
          
          // Extract currency from the midpoint value (if it has a symbol)
          const midpointValue = row[i + 1]; // Midpoint is middle column
          let currency = "USD";
          let numericMidpoint = 0;
          
          if (midpointValue) {
            const valueStr = String(midpointValue);
            // Detect currency symbols
            if (valueStr.includes("€")) currency = "EUR";
            else if (valueStr.includes("£")) currency = "GBP";
            else if (valueStr.includes("kr")) currency = "DKK/SEK/NOK";
            else if (valueStr.includes("zł")) currency = "PLN";
            else if (valueStr.includes("₺")) currency = "TRY";
            else if (valueStr.includes("$")) currency = "USD/AUD/CAD";
            
            // Extract numeric value
            numericMidpoint = parseFloat(valueStr.replace(/[^0-9.-]/g, ""));
          }
          
          records.push({
            country: country.trim(),
            level: String(level),
            kf_midpoint: numericMidpoint || null,
            wtw_midpoint: null, // Will update based on data source
            currency,
            effective_date: new Date().toISOString().split('T')[0],
          });
        }
      }

      const { error } = await supabase.from("payband_midpoints").insert(records);

      if (error) throw error;

      toast({ 
        title: "Pay band data uploaded successfully!",
        description: `${records.length} pay band records imported.`
      });
      setFile(null);
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pay Band Midpoints Upload</CardTitle>
        <CardDescription>
          Upload Korn Ferry and Towers Watson pay band data (updated every 2 years)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="payband-file">Excel File (Pay Bands - midpoints sheet)</Label>
          <Input
            id="payband-file"
            type="file"
            accept=".xlsx,.xls"
            onChange={handleFileChange}
          />
        </div>
        <Button onClick={handleUpload} disabled={!file || uploading} className="w-full">
          <Upload className="mr-2 h-4 w-4" />
          {uploading ? "Uploading..." : "Upload Pay Band Data"}
        </Button>
      </CardContent>
    </Card>
  );
};
