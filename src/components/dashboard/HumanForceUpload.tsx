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
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const batchId = uuidv4();
      const records = jsonData.map((row: any) => ({
        upload_batch_id: batchId,
        employee_id: row.employee_id || row.EmployeeID,
        employee_name: row.employee_name || row.Name,
        country: row.country || row.Country,
        level: row.level || row.Level,
        job_title: row.job_title || row.JobTitle,
        current_salary: parseFloat(row.current_salary || row.Salary || 0),
        currency: row.currency || row.Currency || "USD",
        hire_date: row.hire_date || row.HireDate,
        performance_rating: row.performance_rating || row.Performance,
        compa_ratio: parseFloat(row.compa_ratio || row.CompaRatio || 0),
        raw_data: row,
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
