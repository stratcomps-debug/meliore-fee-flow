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
      const sheetName = "Pay Bands - midpoints";
      const worksheet = workbook.Sheets[sheetName];
      
      if (!worksheet) {
        throw new Error("Pay Bands - midpoints sheet not found");
      }

      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
      
      // Parse headers and data (columns B-BX for KF, BZ-DO for WTW)
      const headers = jsonData[0];
      const rows = jsonData.slice(1);

      const records = [];
      for (const row of rows) {
        if (!row[0]) continue; // Skip empty rows
        
        const country = row[0];
        const level = row[1];
        
        // Extract KF and WTW midpoints based on column positions
        // This is simplified - you'll need to map actual column positions
        records.push({
          country,
          level,
          kf_midpoint: row[2], // Adjust column index
          wtw_midpoint: row[3], // Adjust column index
          currency: row[4] || "USD",
          effective_date: new Date().toISOString().split('T')[0],
        });
      }

      const { error } = await supabase.from("payband_midpoints").insert(records);

      if (error) throw error;

      toast({ title: "Pay band data uploaded successfully!" });
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
