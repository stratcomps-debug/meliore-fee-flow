import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { FileDown, Save, ExternalLink, Info } from "lucide-react";
import * as XLSX from "xlsx";
import { Document, Packer, Paragraph, TextRun } from "docx";
import { saveAs } from "file-saver";

export const FCAAnalysisWorkflow = () => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [formData, setFormData] = useState({
    proposed_salary: "",
    budget_amount: "",
    contract_type: "employee",
    inflation_rate: "",
    fx_rate_current: "",
    fx_rate_previous: "",
    fx_change_percent: "",
    macroeconomic_effect: "",
    proposed_adjustment: "",
    fx_year: new Date().getFullYear().toString(),
    performance_rating: "",
    years_experience: "",
    years_in_role: "",
    rationale: "",
    recommendation: "",
  });
  const [paybandInfo, setPaybandInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingMacroData, setFetchingMacroData] = useState(false);
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

  const fetchMacroeconomicData = async (currency: string, country: string, contractType: string) => {
    setFetchingMacroData(true);
    try {
      // Call edge function to fetch data (bypasses CORS)
      const { data, error } = await supabase.functions.invoke('fetch-macro-data', {
        body: { currency, country, contractType }
      });

      if (error) throw error;

      const { inflationRate, fxRateCurrent, fxRatePrevious, fxChangePercent } = data;

      // Calculate macroeconomic effect and proposed adjustment
      const macroEffect = Math.abs(fxChangePercent) + inflationRate;
      const proposedAdjustment = macroEffect * 0.5;

      setFormData((prev) => ({
        ...prev,
        inflation_rate: inflationRate.toFixed(2),
        fx_rate_current: fxRateCurrent.toFixed(4),
        fx_rate_previous: fxRatePrevious.toFixed(4),
        fx_change_percent: fxChangePercent.toFixed(2),
        macroeconomic_effect: macroEffect.toFixed(2),
        proposed_adjustment: proposedAdjustment.toFixed(2),
      }));

      toast({ 
        title: "Macroeconomic data fetched", 
        description: `Inflation: ${inflationRate.toFixed(2)}%, FX Change: ${fxChangePercent.toFixed(2)}%` 
      });
    } catch (error: any) {
      console.error("Error fetching macroeconomic data:", error);
      toast({ 
        title: "Could not fetch macroeconomic data", 
        description: "Please enter the values manually", 
        variant: "destructive" 
      });
    } finally {
      setFetchingMacroData(false);
    }
  };

  const getTradingEconomicsUrl = () => {
    return 'https://tradingeconomics.com/';
  };

  const getExchangeRatesUrl = () => {
    return 'https://www.exchangerates.org.uk/';
  };

  const handleEmployeeSelect = async (employeeId: string) => {
    const employee = employees.find((e) => e.id === employeeId);
    setSelectedEmployee(employee);

    if (employee) {
      // Determine contract type from employee data
      const contractType = employee.raw_data?.employment_condition?.toLowerCase().includes("consultancy") 
        ? "consultancy" 
        : "employee";

      // For consultancy, budget is minimum 6% increase of current fee
      const budgetAmount = contractType === "consultancy" 
        ? Math.ceil(employee.current_salary * 1.06).toString()
        : "";

      // Fetch payband midpoint for this employee
      const { data: paybandData } = await supabase
        .from("payband_midpoints")
        .select("*")
        .eq("country", employee.country)
        .eq("level", employee.level)
        .order("effective_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      setPaybandInfo(paybandData);
      
      setFormData((prev) => ({
        ...prev,
        proposed_salary: employee.current_salary?.toString() || "",
        budget_amount: budgetAmount,
        performance_rating: employee.performance_rating || "",
        contract_type: contractType,
      }));

      // Fetch macroeconomic data
      await fetchMacroeconomicData(employee.currency, employee.country, contractType);
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
          fx_rate: parseFloat(formData.fx_rate_current) || null,
          fx_year: new Date().getFullYear().toString(),
          performance_rating: formData.performance_rating,
          years_experience: parseFloat(formData.years_experience) || null,
          years_in_role: parseFloat(formData.years_in_role) || null,
          rationale: formData.rationale,
          recommendation: formData.recommendation,
          humanforce_record_id: selectedEmployee.id,
        })
        .select()
        .single();

      // Store budget_amount in the fee_approvals document_content for now
      // (we can add it to fca_analyses table later if needed)

      if (error) throw error;

      await supabase.from("fee_approvals").insert({
        fca_analysis_id: analysis.id,
        status: "draft",
        document_content: { 
          employee: selectedEmployee, 
          formData, 
          analysis,
          budget_amount: formData.budget_amount,
        },
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
        [`Current ${formData.contract_type === "consultancy" ? "Fee" : "Salary"}`]: selectedEmployee.current_salary,
        [`Proposed ${formData.contract_type === "consultancy" ? "Fee" : "Salary"}`]: formData.proposed_salary,
        "Currency": selectedEmployee.currency,
        "Contract Type": formData.contract_type,
        "Inflation Rate": formData.inflation_rate,
        "FX Rate Current": formData.fx_rate_current,
        "FX Rate Previous": formData.fx_rate_previous,
        "FX Change %": formData.fx_change_percent,
        "Macroeconomic Effect %": formData.macroeconomic_effect,
        "Proposed Adjustment %": formData.proposed_adjustment,
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
            new Paragraph({ 
              text: `Current ${formData.contract_type === "consultancy" ? "Fee" : "Salary"}: ${selectedEmployee.current_salary} ${selectedEmployee.currency}` 
            }),
            new Paragraph({ 
              text: `Proposed ${formData.contract_type === "consultancy" ? "Fee" : "Salary"}: ${formData.proposed_salary} ${selectedEmployee.currency}` 
            }),
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
              {paybandInfo && (
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <h4 className="font-semibold">Payband Information</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">KF Midpoint:</span>{" "}
                      <span className="font-medium">
                        {paybandInfo.kf_midpoint ? Math.ceil(paybandInfo.kf_midpoint).toLocaleString() : "N/A"} {selectedEmployee.currency}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">WTW Midpoint:</span>{" "}
                      <span className="font-medium">
                        {paybandInfo.wtw_midpoint ? Math.ceil(paybandInfo.wtw_midpoint).toLocaleString() : "N/A"} {selectedEmployee.currency}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Effective Date:</span>{" "}
                      <span className="font-medium">
                        {paybandInfo.effective_date ? new Date(paybandInfo.effective_date).toLocaleDateString() : "N/A"}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label>Current {formData.contract_type === "consultancy" ? "Fee" : "Salary"}</Label>
                  <Input value={selectedEmployee.current_salary} disabled />
                </div>
                <div className="space-y-2">
                  <Label>Proposed {formData.contract_type === "consultancy" ? "Fee" : "Salary"}</Label>
                  <Input
                    type="number"
                    value={formData.proposed_salary}
                    onChange={(e) => setFormData({ ...formData, proposed_salary: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>
                    Budget Amount {formData.contract_type === "consultancy" && "(Min 6% increase)"}
                  </Label>
                  <Input
                    type="number"
                    placeholder="Approved budget"
                    value={formData.budget_amount}
                    onChange={(e) => setFormData({ ...formData, budget_amount: e.target.value })}
                  />
                  {formData.contract_type === "consultancy" && selectedEmployee && (
                    <p className="text-xs text-muted-foreground">
                      FYI 6% = {Math.ceil(selectedEmployee.current_salary * 1.06).toLocaleString()} {selectedEmployee.currency}
                    </p>
                  )}
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
              </div>

              <div className="p-4 bg-muted rounded-lg space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h4 className="font-semibold">Macroeconomic Analysis</h4>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <Info className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent className="max-w-xs">
                          <p>Data is auto-fetched from World Bank API and may be historical. Please verify current values using the links provided.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  {fetchingMacroData && <span className="text-sm text-muted-foreground">Fetching data...</span>}
                </div>
                
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs">Inflation Rate (%)</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2"
                        onClick={() => window.open(getTradingEconomicsUrl(), '_blank')}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Verify
                      </Button>
                    </div>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="e.g., 3.8"
                      value={formData.inflation_rate}
                      onChange={(e) => setFormData({ ...formData, inflation_rate: e.target.value })}
                      disabled={fetchingMacroData}
                    />
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <Label className="text-xs">USD - Local Currency Rate (This Year)</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 px-2"
                        onClick={() => window.open(getExchangeRatesUrl(), '_blank')}
                      >
                        <ExternalLink className="h-3 w-3 mr-1" />
                        Verify
                      </Button>
                    </div>
                    <Input
                      type="number"
                      step="0.0001"
                      placeholder="e.g., 0.95"
                      value={formData.fx_rate_current}
                      onChange={(e) => {
                        const newCurrent = e.target.value;
                        const previous = parseFloat(formData.fx_rate_previous) || 0;
                        const current = parseFloat(newCurrent) || 0;
                        const fxChange = previous > 0 ? ((current - previous) / previous) * 100 : 0;
                        const inflation = parseFloat(formData.inflation_rate) || 0;
                        const macroEffect = Math.abs(fxChange) + inflation;
                        const adjustment = macroEffect * 0.5;
                        
                        setFormData({ 
                          ...formData, 
                          fx_rate_current: newCurrent,
                          fx_change_percent: fxChange.toFixed(2),
                          macroeconomic_effect: macroEffect.toFixed(2),
                          proposed_adjustment: adjustment.toFixed(2),
                        });
                      }}
                      disabled={fetchingMacroData}
                    />
                  </div>
                  
                  <div>
                    <Label className="text-xs">USD - Local Currency Rate (Last Year)</Label>
                    <Input
                      type="number"
                      step="0.0001"
                      placeholder="e.g., 0.92"
                      value={formData.fx_rate_previous}
                      onChange={(e) => {
                        const newPrevious = e.target.value;
                        const previous = parseFloat(newPrevious) || 0;
                        const current = parseFloat(formData.fx_rate_current) || 0;
                        const fxChange = previous > 0 ? ((current - previous) / previous) * 100 : 0;
                        const inflation = parseFloat(formData.inflation_rate) || 0;
                        const macroEffect = Math.abs(fxChange) + inflation;
                        const adjustment = macroEffect * 0.5;
                        
                        setFormData({ 
                          ...formData, 
                          fx_rate_previous: newPrevious,
                          fx_change_percent: fxChange.toFixed(2),
                          macroeconomic_effect: macroEffect.toFixed(2),
                          proposed_adjustment: adjustment.toFixed(2),
                        });
                      }}
                      disabled={fetchingMacroData}
                    />
                  </div>
                  
                  <div>
                    <Label className="text-xs">FX Change (%)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.fx_change_percent}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                  
                  <div>
                    <Label className="text-xs">Total Macro Effect (%) = FX Change + Inflation</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.macroeconomic_effect}
                      disabled
                      className="bg-muted font-semibold"
                    />
                  </div>
                  
                  <div>
                    <Label className="text-xs">Proposed Adjustment (50% of Total)</Label>
                    <Input
                      type="number"
                      step="0.01"
                      value={formData.proposed_adjustment}
                      disabled
                      className="bg-muted font-semibold"
                    />
                  </div>
                </div>
              </div>

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
                  placeholder={`Explain the reasoning for this ${formData.contract_type === "consultancy" ? "fee" : "salary"} change`}
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
