import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import * as XLSX from "xlsx";
import { Upload } from "lucide-react";
import { v4 as uuidv4 } from "uuid";

export const HumanForceUpload = () => {
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
      
      // Find the "FCA input sheet" or second sheet
      let worksheet;
      const fcaSheetName = workbook.SheetNames.find(name => name.toLowerCase().includes("fca"));
      if (fcaSheetName) {
        worksheet = workbook.Sheets[fcaSheetName];
      } else if (workbook.SheetNames.length > 1) {
        worksheet = workbook.Sheets[workbook.SheetNames[1]]; // Second sheet
      } else {
        throw new Error("FCA input sheet not found. Please upload the correct HumanForce file.");
      }

      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const batchId = uuidv4();
      const records = jsonData.map((row: any) => ({
        upload_batch_id: batchId,
        employee_id: row["intelliHR ID"] || row.intelliHR_ID,
        employee_name: row["Full Name"] || row.Full_Name,
        country: row.Location || row.location,
        level: String(row["Pay Grade"] || row.Pay_Grade || ""),
        job_title: row["Job Position Title"] || row.Job_Position_Title,
        current_salary: parseFloat(row["Base Annual Salary"] || row.Base_Annual_Salary || 0),
        currency: extractCurrency(row["Base Annual Salary"]),
        hire_date: row["Job Start Date"] || row.Job_Start_Date,
        performance_rating: row["Performance Rating"] || null,
        compa_ratio: parseFloat(row.CR || 0),
        raw_data: {
          ...row,
          bottom_of_band: row["Bottom of band"],
          midpoint_of_band: row["Midpoint of band"],
          top_of_band: row["Top of band"],
          business_unit: row["Business Unit"],
          supervisor: row["Supervisor Name"],
          employment_condition: row["Employment Condition"],
          fte: row.FTE,
        },
      }));

      const { error } = await supabase.from("humanforce_data").insert(records);

      if (error) throw error;

      toast({ 
        title: "HumanForce data uploaded successfully!",
        description: `${records.length} employee records imported.`
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

  const extractCurrency = (salaryValue: any): string => {
    if (!salaryValue) return "USD";
    const str = String(salaryValue);
    if (str.includes("€") || str.includes("EUR")) return "EUR";
    if (str.includes("£") || str.includes("GBP")) return "GBP";
    if (str.includes("kr") || str.includes("SEK")) return "SEK";
    if (str.includes("zł") || str.includes("PLN")) return "PLN";
    return "USD";
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>HumanForce Data Upload</CardTitle>
        <CardDescription>
          Upload employee data from HumanForce export
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="humanforce-file">Excel/CSV File</Label>
          <Input
            id="humanforce-file"
            type="file"
            accept=".xlsx,.xls,.csv"
            onChange={handleFileChange}
          />
        </div>
        <Button onClick={handleUpload} disabled={!file || uploading} className="w-full">
          <Upload className="mr-2 h-4 w-4" />
          {uploading ? "Uploading..." : "Upload Employee Data"}
        </Button>
      </CardContent>
    </Card>
  );
};
