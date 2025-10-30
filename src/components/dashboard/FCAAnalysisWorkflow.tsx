import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FileDown, Save } from "lucide-react";
import * as XLSX from "xlsx";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { saveAs } from "file-saver";

export const FCAAnalysisWorkflow = () => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [formData, setFormData] = useState({
    proposed_salary: "",
    contract_type: "employee",
    inflation_rate: "",
    fx_rate: "",
    fx_year: new Date().getFullYear().toString(),
    performance_rating: "",
    years_experience: "",
    years_in_role: "",
    rationale: "",
    recommendation: "",
  });
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadEmployees();
  }, []);

  const loadEmployees = async () => {
    const { data, error } = await supabase
      .from("humanforce_data")
      .select("*")
      .order("employee_name");

    if (error) {
      toast({ title: "Error loading employees", variant: "destructive" });
    } else {
      setEmployees(data || []);
    }
  };

  const handleEmployeeSelect = async (employeeId: string) => {
    const employee = employees.find((e) => e.id === employeeId);
    setSelectedEmployee(employee);

    if (employee) {
      // Fetch payband midpoint for this employee
      const { data: paybandData } = await supabase
        .from("payband_midpoints")
        .select("*")
        .eq("country", employee.country)
        .eq("level", employee.level)
        .order("effective_date", { ascending: false })
        .limit(1)
        .single();

      if (paybandData) {
        setFormData((prev) => ({
          ...prev,
          proposed_salary: employee.current_salary?.toString() || "",
          performance_rating: employee.performance_rating || "",
        }));
      }
    }
  };

  const calculateCompaRatio = (salary: number, midpoint: number) => {
    if (!midpoint) return 0;
    return (salary / midpoint) * 100;
  };

  const handleSave = async () => {
    if (!selectedEmployee) return;

    setLoading(true);
    try {
      const { data: paybandData } = await supabase
        .from("payband_midpoints")
        .select("*")
        .eq("country", selectedEmployee.country)
        .eq("level", selectedEmployee.level)
        .order("effective_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const midpoint = paybandData?.kf_midpoint || paybandData?.wtw_midpoint || 0;
      const compaRatioCurrent = calculateCompaRatio(selectedEmployee.current_salary, midpoint);
      const compaRatioProposed = calculateCompaRatio(parseFloat(formData.proposed_salary), midpoint);

      const { data: analysis, error } = await supabase
        .from("fca_analyses")
        .insert({
          employee_name: selectedEmployee.employee_name,
          country: selectedEmployee.country,
          level: selectedEmployee.level,
          current_salary: selectedEmployee.current_salary,
          proposed_salary: parseFloat(formData.proposed_salary),
          currency: selectedEmployee.currency,
          contract_type: formData.contract_type,
          kf_midpoint: paybandData?.kf_midpoint,
          wtw_midpoint: paybandData?.wtw_midpoint,
          compa_ratio_current: compaRatioCurrent,
          compa_ratio_proposed: compaRatioProposed,
          inflation_rate: parseFloat(formData.inflation_rate) || null,
          fx_rate: parseFloat(formData.fx_rate) || null,
          fx_year: formData.fx_year,
          performance_rating: formData.performance_rating,
          years_experience: parseFloat(formData.years_experience) || null,
          years_in_role: parseFloat(formData.years_in_role) || null,
          rationale: formData.rationale,
          recommendation: formData.recommendation,
          humanforce_record_id: selectedEmployee.id,
        })
        .select()
        .single();

      if (error) throw error;

      await supabase.from("fee_approvals").insert({
        fca_analysis_id: analysis.id,
        status: "draft",
        document_content: { employee: selectedEmployee, formData, analysis },
      });

      toast({ title: "FCA Analysis saved successfully!" });
    } catch (error: any) {
      toast({ title: "Error saving analysis", description: error.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const exportToExcel = () => {
    if (!selectedEmployee) return;

    const ws = XLSX.utils.json_to_sheet([
      {
        "Employee Name": selectedEmployee.employee_name,
        "Country": selectedEmployee.country,
        "Level": selectedEmployee.level,
        "Current Salary": selectedEmployee.current_salary,
        "Proposed Salary": formData.proposed_salary,
        "Currency": selectedEmployee.currency,
        "Contract Type": formData.contract_type,
        "Inflation Rate": formData.inflation_rate,
        "FX Rate": formData.fx_rate,
        "Performance Rating": formData.performance_rating,
        "Years Experience": formData.years_experience,
        "Rationale": formData.rationale,
        "Recommendation": formData.recommendation,
      },
    ]);

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "FCA Analysis");
    XLSX.writeFile(wb, `FCA_Analysis_${selectedEmployee.employee_name}.xlsx`);
  };

  const exportToWord = async () => {
    if (!selectedEmployee) return;

    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            new Paragraph({
              children: [
                new TextRun({ text: "Fee Approval Document", bold: true, size: 32 }),
              ],
            }),
            new Paragraph({ text: "" }),
            new Paragraph({ text: `Employee: ${selectedEmployee.employee_name}` }),
            new Paragraph({ text: `Country: ${selectedEmployee.country}` }),
            new Paragraph({ text: `Level: ${selectedEmployee.level}` }),
            new Paragraph({ text: `Current Salary: ${selectedEmployee.current_salary} ${selectedEmployee.currency}` }),
            new Paragraph({ text: `Proposed Salary: ${formData.proposed_salary} ${selectedEmployee.currency}` }),
            new Paragraph({ text: "" }),
            new Paragraph({ text: `Rationale: ${formData.rationale}` }),
            new Paragraph({ text: `Recommendation: ${formData.recommendation}` }),
          ],
        },
      ],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `Fee_Approval_${selectedEmployee.employee_name}.docx`);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create FCA Analysis</CardTitle>
          <CardDescription>Select an employee and complete the fee analysis</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Select Employee</Label>
            <Select onValueChange={handleEmployeeSelect}>
              <SelectTrigger>
                <SelectValue placeholder="Choose an employee" />
              </SelectTrigger>
              <SelectContent>
                {employees.map((emp) => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.employee_name} - {emp.country} ({emp.level})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {selectedEmployee && (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Current Salary</Label>
                  <Input value={selectedEmployee.current_salary} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Proposed Salary</Label>
                  <Input
                    type="number"
                    value={formData.proposed_salary}
                    onChange={(e) => setFormData({ ...formData, proposed_salary: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contract Type</Label>
                  <Select
                    value={formData.contract_type}
                    onValueChange={(value) => setFormData({ ...formData, contract_type: value })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="employee">Employee</SelectItem>
                      <SelectItem value="consultancy">Consultancy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Inflation Rate (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="From tradingeconomics.com"
                    value={formData.inflation_rate}
                    onChange={(e) => setFormData({ ...formData, inflation_rate: e.target.value })}
                  />
                </div>
              </div>

              {formData.contract_type === "consultancy" && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>FX Rate (vs USD)</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      placeholder="From exchangerates.org.uk"
                      value={formData.fx_rate}
                      onChange={(e) => setFormData({ ...formData, fx_rate: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>FX Year</Label>
                    <Input
                      value={formData.fx_year}
                      onChange={(e) => setFormData({ ...formData, fx_year: e.target.value })}
                    />
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Performance Rating</Label>
                  <Input
                    value={formData.performance_rating}
                    onChange={(e) => setFormData({ ...formData, performance_rating: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Years Experience</Label>
                  <Input
                    type="number"
                    value={formData.years_experience}
                    onChange={(e) => setFormData({ ...formData, years_experience: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Years in Role</Label>
                  <Input
                    type="number"
                    value={formData.years_in_role}
                    onChange={(e) => setFormData({ ...formData, years_in_role: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Rationale</Label>
                <Textarea
                  placeholder="Explain the reasoning for this fee/salary change"
                  value={formData.rationale}
                  onChange={(e) => setFormData({ ...formData, rationale: e.target.value })}
                  rows={4}
                />
              </div>

              <div className="space-y-2">
                <Label>Recommendation</Label>
                <Textarea
                  placeholder="Your recommendation"
                  value={formData.recommendation}
                  onChange={(e) => setFormData({ ...formData, recommendation: e.target.value })}
                  rows={3}
                />
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSave} disabled={loading} className="flex-1">
                  <Save className="mr-2 h-4 w-4" />
                  Save Analysis
                </Button>
                <Button onClick={exportToExcel} variant="outline">
                  <FileDown className="mr-2 h-4 w-4" />
                  Excel
                </Button>
                <Button onClick={exportToWord} variant="outline">
                  <FileDown className="mr-2 h-4 w-4" />
                  Word
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
