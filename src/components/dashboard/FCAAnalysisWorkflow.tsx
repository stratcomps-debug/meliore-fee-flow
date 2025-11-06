import { useState, useEffect } from "react";
import { differenceInMonths, differenceInYears } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Save, ExternalLink, Info } from "lucide-react";

// Data source mapping
const WTW_COUNTRIES = [
  "Austria", "Chile", "Costa Rica", "Egypt", "Georgia", "Ghana", 
  "Hong Kong", "Ireland", "Luxembourg", "Malaysia", "Norway", 
  "Portugal", "Sweden", "Turkey"
];

const KF_COUNTRIES = [
  "Argentina", "Australia", "Bangladesh", "Belgium", "Brazil", "Canada",
  "Denmark", "France", "Germany", "India", "Indonesia", "Italy", "Japan",
  "Kenya", "Netherlands", "Nigeria", "Philippines", "Poland", "Senegal",
  "South Africa", "South Korea", "Spain", "Thailand", "UK", "USA"
];

export const FCAAnalysisWorkflow = () => {
  const [employees, setEmployees] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<any>(null);
  const [formData, setFormData] = useState({
    analysis_type: "existing_staff_contract_renewal",
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
    merit_increase: 0,
    rationale: "",
    recommendation: "",
    external_candidate_level: "", // For external candidates: entry, experienced, specialized
    supervisor_name: "",
  });
  
  // For external candidates - manual entry
  const [externalCandidateData, setExternalCandidateData] = useState({
    employee_name: "",
    country: "",
    level: "",
    job_title: "",
    currency: "",
  });
  
  const calculateYearsWithOrganisation = (hireDate: string | null): string => {
    if (!hireDate) return "N/A";
    
    const start = new Date(hireDate);
    const today = new Date();
    
    const years = differenceInYears(today, start);
    const totalMonths = differenceInMonths(today, start);
    const months = totalMonths - (years * 12);
    
    return `${years} years and ${months} months`;
  };
  
  const calculateYearsInRoleNumeric = (hireDate: string | null): number | null => {
    if (!hireDate) return null;
    
    const start = new Date(hireDate);
    const today = new Date();
    const totalMonths = differenceInMonths(today, start);
    
    return Math.round((totalMonths / 12) * 10) / 10; // Round to 1 decimal place
  };
  const [paybandInfo, setPaybandInfo] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [fetchingMacroData, setFetchingMacroData] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    loadEmployees();
  }, []);
  
  // Fetch payband data for external candidates when country and level are entered
  useEffect(() => {
    if (formData.analysis_type === 'external_candidate_initial' && 
        externalCandidateData.country && 
        externalCandidateData.level) {
      fetchPaybandForExternalCandidate();
    }
  }, [externalCandidateData.country, externalCandidateData.level, formData.analysis_type]);
  
  const fetchPaybandForExternalCandidate = async () => {
    if (!externalCandidateData.country || !externalCandidateData.level) return;
    
    const { data, error } = await supabase
      .from("payband_midpoints")
      .select("*")
      .eq("country", externalCandidateData.country)
      .eq("level", externalCandidateData.level)
      .order("effective_date", { ascending: false })
      .limit(1)
      .maybeSingle();
      
    if (!error && data) {
      setPaybandInfo(data);
    }
  };
  
  // Helper to get current employee/candidate data
  const getCurrentEmployeeData = () => {
    if (formData.analysis_type === 'external_candidate_initial') {
      return {
        ...externalCandidateData,
        current_salary: 0,
        compa_ratio: null,
        hire_date: null,
      };
    }
    return selectedEmployee;
  };

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

  const fetchMacroeconomicData = async (currency: string, country: string, contractType: string, analysisType: string) => {
    // Skip macroeconomic data for external candidates
    if (analysisType === 'external_candidate_initial') {
      setFormData((prev) => ({
        ...prev,
        inflation_rate: "N/A",
        fx_rate_current: "N/A",
        fx_rate_previous: "N/A",
        fx_change_percent: "N/A",
        macroeconomic_effect: "N/A",
        proposed_adjustment: "0",
      }));
      return;
    }

    setFetchingMacroData(true);
    try {
      // Call edge function to fetch data (bypasses CORS)
      const { data, error } = await supabase.functions.invoke('fetch-macro-data', {
        body: { currency, country, contractType }
      });

      if (error) throw error;

      const { inflationRate, fxRateCurrent, fxRatePrevious, fxChangePercent } = data;

      // Calculate macroeconomic effect and proposed adjustment
      // FX change (positive = more local currency per USD = good for purchasing power)
      // Inflation (positive = reduces purchasing power, so subtract it)
      const macroEffect = fxChangePercent - inflationRate;
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

      // Use midpoint from HumanForce data if available (more accurate)
      const midpointFromData = employee.raw_data?.midpoint_of_band || employee.raw_data?.["Midpoint of band"];
      
      let paybandData = null;
      if (midpointFromData) {
        const isWTW = WTW_COUNTRIES.includes(employee.country);
        paybandData = {
          kf_midpoint: isWTW ? null : parseFloat(midpointFromData),
          wtw_midpoint: isWTW ? parseFloat(midpointFromData) : null,
          currency: employee.currency,
        };
      }

      setPaybandInfo(paybandData);
      
      // Use compa-ratio from employee data if available, otherwise calculate it
      let currentCompaRatio = 0;
      if (employee.compa_ratio) {
        currentCompaRatio = employee.compa_ratio;
      } else if (paybandData) {
        const midpoint = paybandData.kf_midpoint || paybandData.wtw_midpoint || 0;
        currentCompaRatio = midpoint > 0 ? employee.current_salary / midpoint : 0;
      }
      
      // Calculate merit increase if performance rating exists
      const meritIncrease = employee.performance_rating 
        ? calculateMeritIncrease(employee.performance_rating, currentCompaRatio)
        : 0;
      
      setFormData((prev) => ({
        ...prev,
        proposed_salary: employee.current_salary?.toString() || "",
        budget_amount: budgetAmount,
        performance_rating: employee.performance_rating || "",
        merit_increase: meritIncrease,
        contract_type: contractType,
      }));

      // Fetch macroeconomic data
      await fetchMacroeconomicData(employee.currency, employee.country, contractType, formData.analysis_type);
    }
  };

  // Auto-update proposed salary when percentages change
  useEffect(() => {
    if (selectedEmployee && (formData.merit_increase || formData.proposed_adjustment)) {
      const totalIncrease = 
        (parseFloat(formData.merit_increase?.toString() || "0")) + 
        (parseFloat(formData.proposed_adjustment || "0"));
      
      const newProposedSalary = Math.ceil(
        selectedEmployee.current_salary * (1 + totalIncrease / 100)
      );
      
      setFormData(prev => ({
        ...prev,
        proposed_salary: newProposedSalary.toString()
      }));
    }
  }, [formData.merit_increase, formData.proposed_adjustment, selectedEmployee]);

  const calculateCompaRatio = (salary: number, midpoint: number) => {
    if (!midpoint) return 0;
    return (salary / midpoint) * 100;
  };

  const calculateMeritIncrease = (performanceRating: string, compaRatio: number): number => {
    // Performance rating to merit increase mapping based on CR ranges
    // From the provided table with columns: Performance rating, Min increase, Max increase, 
    // merit increase if CR < 95%, merit increase if CR 95-105%, merit increase if CR > 105%
    const meritIncreaseTable: Record<string, { 
      min: number, 
      max: number, 
      below95: number, 
      between95and105: number, 
      above105: number 
    }> = {
      'BE': { min: 0, max: 0, below95: 0, between95and105: 0, above105: 0 },
      'OI': { min: 0, max: 0, below95: 0, between95and105: 0, above105: 0 },
      'ME': { min: 0, max: 2, below95: 2, between95and105: 1, above105: 0 },
      'EE': { min: 2, max: 3.5, below95: 3.5, between95and105: 2.75, above105: 2 },
      'O': { min: 3.5, max: 5, below95: 5, between95and105: 4.25, above105: 3.5 }
    };

    const rating = meritIncreaseTable[performanceRating];
    if (!rating) return 0;

    const crPercent = compaRatio * 100;
    
    // CR < 95%
    if (crPercent < 95) {
      return rating.below95;
    } 
    // CR >= 95% and < 105%
    else if (crPercent >= 95 && crPercent < 105) {
      return rating.between95and105;
    } 
    // CR >= 105%
    else {
      return rating.above105;
    }
  };

  const handleSave = async () => {
    const currentData = getCurrentEmployeeData();
    if (!currentData || !currentData.employee_name || !currentData.country || !currentData.level) {
      toast({ title: "Please fill in all required fields", variant: "destructive" });
      return;
    }

    if (!formData.proposed_salary) {
      toast({ title: "Please enter a proposed salary", variant: "destructive" });
      return;
    }

    // Validation: Proposed salary must be >= current salary (except for external candidates)
    const proposedSalaryNum = parseFloat(formData.proposed_salary);
    if (formData.analysis_type !== 'external_candidate_initial' && proposedSalaryNum < currentData.current_salary) {
      toast({ 
        title: "Invalid proposed salary", 
        description: `Proposed ${formData.contract_type === "consultancy" ? "fee" : "salary"} (${proposedSalaryNum.toLocaleString()} USD) cannot be lower than current ${formData.contract_type === "consultancy" ? "fee" : "salary"} (${currentData.current_salary.toLocaleString()} USD)`,
        variant: "destructive" 
      });
      return;
    }

    setLoading(true);
    try {
      const currentData = getCurrentEmployeeData();
      
      // Get midpoint - either from HumanForce data or from payband lookup
      let midpoint = 0;
      let isWTW = false;
      
      if (formData.analysis_type === 'external_candidate_initial') {
        // For external candidates, use payband midpoint
        midpoint = paybandInfo?.kf_midpoint || paybandInfo?.wtw_midpoint || 0;
        isWTW = WTW_COUNTRIES.includes(currentData.country);
      } else {
        // For existing staff, use midpoint from HumanForce data
        const midpointFromData = selectedEmployee?.raw_data?.midpoint_of_band || selectedEmployee?.raw_data?.["Midpoint of band"];
        midpoint = midpointFromData ? parseFloat(midpointFromData) : 0;
        isWTW = WTW_COUNTRIES.includes(selectedEmployee.country);
      }
      
      const compaRatioCurrent = calculateCompaRatio(currentData.current_salary, midpoint);
      const compaRatioProposed = calculateCompaRatio(parseFloat(formData.proposed_salary), midpoint);

      const { data: analysis, error } = await supabase
        .from("fca_analyses")
        .insert({
          employee_name: currentData.employee_name,
          country: currentData.country,
          level: currentData.level,
          current_salary: currentData.current_salary,
          proposed_salary: parseFloat(formData.proposed_salary),
          currency: currentData.currency || (formData.contract_type === "consultancy" ? "USD" : paybandInfo?.currency),
          contract_type: formData.contract_type,
          analysis_type: formData.analysis_type,
          kf_midpoint: isWTW ? null : midpoint,
          wtw_midpoint: isWTW ? midpoint : null,
          compa_ratio_current: compaRatioCurrent,
          compa_ratio_proposed: compaRatioProposed,
          inflation_rate: formData.analysis_type === 'external_candidate_initial' ? null : (parseFloat(formData.inflation_rate) || null),
          fx_rate: formData.analysis_type === 'external_candidate_initial' ? null : (parseFloat(formData.fx_rate_current) || null),
          fx_year: new Date().getFullYear().toString(),
          performance_rating: formData.analysis_type === 'external_candidate_initial' ? null : formData.performance_rating,
          years_in_role: formData.analysis_type === 'external_candidate_initial' ? null : calculateYearsInRoleNumeric(selectedEmployee?.hire_date),
          rationale: formData.rationale,
          recommendation: formData.recommendation,
          supervisor_name: formData.supervisor_name || null,
          humanforce_record_id: formData.analysis_type === 'external_candidate_initial' ? null : selectedEmployee?.id,
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
          employee: formData.analysis_type === 'external_candidate_initial' ? currentData : selectedEmployee, 
          formData: {
            ...formData,
            external_candidate_level: formData.external_candidate_level,
          }, 
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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Create FCA Analysis</CardTitle>
          <CardDescription>Select analysis type and employee to complete the fee analysis</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Analysis Type</Label>
            <Select 
              value={formData.analysis_type}
              onValueChange={(value) => {
                setFormData({ ...formData, analysis_type: value });
                // Re-fetch macro data if employee is selected
                if (selectedEmployee) {
                  fetchMacroeconomicData(
                    selectedEmployee.currency, 
                    selectedEmployee.country, 
                    formData.contract_type,
                    value
                  );
                }
              }}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="external_candidate_initial">External Candidate - Initial Proposition</SelectItem>
                <SelectItem value="existing_staff_contract_renewal">Existing Staff - Contract Renewal</SelectItem>
                <SelectItem value="existing_staff_internal_move">Existing Staff - Internal Move</SelectItem>
                <SelectItem value="existing_staff_promotion_pathway">Existing Staff - Promotion Pathway</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {formData.analysis_type === 'external_candidate_initial' ? (
            <>
              <div className="p-4 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 rounded-lg">
                <h4 className="font-semibold mb-2">External Candidate Details</h4>
                <p className="text-sm text-muted-foreground mb-4">
                  Enter the candidate's information manually as they are not yet in the system.
                </p>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Candidate Name *</Label>
                    <Input
                      placeholder="Full name"
                      value={externalCandidateData.employee_name}
                      onChange={(e) => setExternalCandidateData({ ...externalCandidateData, employee_name: e.target.value })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Supervisor Name</Label>
                    <Input
                      placeholder="Reports to"
                      value={formData.supervisor_name}
                      onChange={(e) => setFormData({ ...formData, supervisor_name: e.target.value })}
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Country *</Label>
                    <Select
                      value={externalCandidateData.country}
                      onValueChange={(value) => {
                        // Determine currency based on contract type and country
                        let currency = "USD";
                        if (formData.contract_type === "employee") {
                          // Map country to currency for employee contracts
                          const currencyMap: Record<string, string> = {
                            "Austria": "EUR", "Belgium": "EUR", "France": "EUR", "Germany": "EUR",
                            "Ireland": "EUR", "Italy": "EUR", "Luxembourg": "EUR", "Netherlands": "EUR",
                            "Portugal": "EUR", "Spain": "EUR",
                            "UK": "GBP", "Denmark": "DKK", "Norway": "NOK", "Poland": "PLN",
                            "Sweden": "SEK", "USA": "USD", "Canada": "CAD", "Mexico": "MXN",
                            "Brazil": "BRL", "Argentina": "ARS", "Chile": "CLP", "Costa Rica": "CRC",
                            "Australia": "AUD", "New Zealand": "NZD", "Japan": "JPY", "South Korea": "KRW",
                            "Hong Kong": "HKD", "India": "INR", "Indonesia": "IDR", "Malaysia": "MYR",
                            "Philippines": "PHP", "Thailand": "THB", "Bangladesh": "BDT", "South Africa": "ZAR",
                            "Egypt": "EGP", "Kenya": "KES", "Nigeria": "NGN", "Ghana": "GHS", "Senegal": "XOF"
                          };
                          currency = currencyMap[value] || "USD";
                        }
                        setExternalCandidateData({ ...externalCandidateData, country: value, currency });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select country" />
                      </SelectTrigger>
                      <SelectContent>
                        {[...KF_COUNTRIES, ...WTW_COUNTRIES].sort().map((country) => (
                          <SelectItem key={country} value={country}>{country}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Level *</Label>
                    <Select
                      value={externalCandidateData.level}
                      onValueChange={(value) => {
                        setExternalCandidateData({ ...externalCandidateData, level: value });
                        // Reset candidate level selection when level changes
                        setFormData(prev => ({ ...prev, external_candidate_level: "" }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select level" />
                      </SelectTrigger>
                      <SelectContent>
                        {["1", "2", "3", "4", "5", "6", "7", "8"].map((level) => (
                          <SelectItem key={level} value={level}>
                            Level {level}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>Job Title *</Label>
                    <Input
                      placeholder="Position title"
                      value={externalCandidateData.job_title}
                      onChange={(e) => setExternalCandidateData({ ...externalCandidateData, job_title: e.target.value })}
                    />
                  </div>
                </div>
              </div>
            </>
          ) : (
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
          )}

          {(selectedEmployee || (formData.analysis_type === 'external_candidate_initial' && externalCandidateData.employee_name && externalCandidateData.country && externalCandidateData.level)) && (
            <>
              {formData.analysis_type !== 'external_candidate_initial' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Years with the Organisation</Label>
                      <Input
                        value={selectedEmployee.hire_date ? calculateYearsWithOrganisation(selectedEmployee.hire_date) : "N/A"}
                        disabled
                        className="bg-muted"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Staff Start Date</Label>
                      <Input
                        type="date"
                        value={selectedEmployee.hire_date || ""}
                        disabled
                        className="bg-muted"
                      />
                    </div>
                  </div>

                  <div className="p-4 bg-muted rounded-lg space-y-2">
                    <h4 className="font-semibold">Employee Information</h4>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Current Compa-Ratio:</span>{" "}
                        <span className="font-medium">
                          {selectedEmployee.compa_ratio 
                            ? `${(selectedEmployee.compa_ratio * 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
                            : paybandInfo 
                              ? (() => {
                                  const midpoint = paybandInfo.kf_midpoint || paybandInfo.wtw_midpoint || 0;
                                  const cr = midpoint > 0 ? (selectedEmployee.current_salary / midpoint) * 100 : 0;
                                  return `${cr.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
                                })()
                              : "N/A"}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Job Title:</span>{" "}
                        <span className="font-medium">{selectedEmployee.job_title || "N/A"}</span>
                      </div>
                    </div>
                  </div>
                </>
              )}

              {paybandInfo && (
                <div className="p-4 bg-muted rounded-lg space-y-2">
                  <h4 className="font-semibold">Payband Information</h4>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">KF Midpoint:</span>{" "}
                      <span className="font-medium">
                        {paybandInfo.kf_midpoint ? paybandInfo.kf_midpoint.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "N/A"} {formData.contract_type === "consultancy" ? "USD" : (externalCandidateData.currency || paybandInfo.currency || getCurrentEmployeeData()?.currency || "")}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted-foreground">WTW Midpoint:</span>{" "}
                      <span className="font-medium">
                        {paybandInfo.wtw_midpoint ? paybandInfo.wtw_midpoint.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "N/A"} {formData.contract_type === "consultancy" ? "USD" : (externalCandidateData.currency || paybandInfo.currency || getCurrentEmployeeData()?.currency || "")}
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

              <div className={formData.analysis_type === 'external_candidate_initial' ? "grid grid-cols-1 gap-4" : "grid grid-cols-2 gap-4"}>
                {formData.analysis_type !== 'external_candidate_initial' && (
                  <div className="space-y-2">
                    <Label>Current {formData.contract_type === "consultancy" ? "Fee" : "Salary"}</Label>
                    <Input 
                      value={getCurrentEmployeeData()?.current_salary?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "N/A"} 
                      disabled
                      type="text"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label>
                    Budget Amount
                  </Label>
                  <Input
                    type="text"
                    placeholder="Approved budget"
                    value={formData.budget_amount ? parseFloat(formData.budget_amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""}
                    onChange={(e) => {
                      const value = e.target.value.replace(/,/g, '');
                      if (!isNaN(parseFloat(value)) || value === '') {
                        setFormData({ ...formData, budget_amount: value });
                      }
                    }}
                  />
                  {formData.contract_type === "consultancy" && getCurrentEmployeeData() && getCurrentEmployeeData().current_salary > 0 && (
                    <p className="text-xs text-muted-foreground">
                      FYI 6% = {Math.ceil(getCurrentEmployeeData().current_salary * 1.06).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {getCurrentEmployeeData().currency || paybandInfo?.currency}
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contract Type</Label>
                  <Select
                    value={formData.contract_type}
                    onValueChange={(value) => {
                      setFormData({ ...formData, contract_type: value });
                      // Update currency for external candidates when contract type changes
                      if (formData.analysis_type === 'external_candidate_initial' && externalCandidateData.country) {
                        let currency = "USD";
                        if (value === "employee") {
                          const currencyMap: Record<string, string> = {
                            "Austria": "EUR", "Belgium": "EUR", "France": "EUR", "Germany": "EUR",
                            "Ireland": "EUR", "Italy": "EUR", "Luxembourg": "EUR", "Netherlands": "EUR",
                            "Portugal": "EUR", "Spain": "EUR",
                            "UK": "GBP", "Denmark": "DKK", "Norway": "NOK", "Poland": "PLN",
                            "Sweden": "SEK", "USA": "USD", "Canada": "CAD", "Mexico": "MXN",
                            "Brazil": "BRL", "Argentina": "ARS", "Chile": "CLP", "Costa Rica": "CRC",
                            "Australia": "AUD", "New Zealand": "NZD", "Japan": "JPY", "South Korea": "KRW",
                            "Hong Kong": "HKD", "India": "INR", "Indonesia": "IDR", "Malaysia": "MYR",
                            "Philippines": "PHP", "Thailand": "THB", "Bangladesh": "BDT", "South Africa": "ZAR",
                            "Egypt": "EGP", "Kenya": "KES", "Nigeria": "NGN", "Ghana": "GHS", "Senegal": "XOF"
                          };
                          currency = currencyMap[externalCandidateData.country] || "USD";
                        }
                        setExternalCandidateData(prev => ({ ...prev, currency }));
                      }
                    }}
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

              {formData.analysis_type === 'external_candidate_initial' && externalCandidateData.country && externalCandidateData.level && (
                <div className="space-y-4">
                  <Label>Candidate Level (based on Total Rewards Policy)</Label>
                  <Select
                    value={formData.external_candidate_level}
                    onValueChange={(value) => {
                      setFormData({ ...formData, external_candidate_level: value });
                      // Auto-set merit increase based on candidate level for external candidates
                      let targetCompaRatio = 0;
                      if (value === 'entry') targetCompaRatio = 90;
                      else if (value === 'experienced') targetCompaRatio = 95;
                      else if (value === 'specialized') targetCompaRatio = 105;
                      
                      // Calculate proposed salary based on target CR
                      if (paybandInfo && targetCompaRatio > 0) {
                        const midpoint = paybandInfo.kf_midpoint || paybandInfo.wtw_midpoint || 0;
                        const targetSalary = midpoint * (targetCompaRatio / 100);
                        
                        console.log("Setting proposed salary:", { midpoint, targetCompaRatio, targetSalary });
                        
                        // Set proposed salary directly to target salary for external candidates
                        setFormData(prev => ({ 
                          ...prev, 
                          proposed_salary: targetSalary.toString(),
                          merit_increase: 0 // No merit increase for external candidates, just positioning
                        }));
                      } else {
                        console.log("Cannot calculate proposed salary:", { paybandInfo, targetCompaRatio });
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select candidate level" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="entry">
                        Entry Level (90% CR) - Fully functional, requires hand-holding
                      </SelectItem>
                      <SelectItem value="experienced">
                        Experienced (95% CR) - More than requirements, immediate contribution
                      </SelectItem>
                      <SelectItem value="specialized">
                        Specialized Role (105% CR) - Competitive labor market positioning
                      </SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    {formData.external_candidate_level === 'entry' && 
                      "Entry level: Meets job requirements but will require time to understand/contribute"}
                    {formData.external_candidate_level === 'experienced' && 
                      "Experienced: Brings additional breadth/depth of expertise, starts at middle of scale"}
                    {formData.external_candidate_level === 'specialized' && 
                      "Specialized: Higher evaluation needed to remain competitive in relevant labor market"}
                  </p>
                </div>
              )}

              {formData.analysis_type !== 'external_candidate_initial' && (
                <div className="p-4 bg-muted rounded-lg space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">
                      {formData.contract_type === "consultancy" ? "SOW Assessment" : "Performance Assessment"}
                    </h4>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">
                        {formData.contract_type === "consultancy" 
                          ? "SOW Assessment Related Increase (%)" 
                          : "Performance Related Increase (%)"}
                      </Label>
                      <Input
                        type="text"
                        step="0.01"
                        value={formData.merit_increase ? parseFloat(formData.merit_increase.toString()).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
                        disabled
                        className="bg-muted font-semibold w-24"
                      />
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Label>
                      {formData.contract_type === "consultancy" ? "SOW Rating" : "Performance Rating"}
                    </Label>
                    <Select
                      value={formData.performance_rating || ""}
                    onValueChange={(value) => {
                      // Calculate merit increase when performance rating changes
                      // Use the compa_ratio from HumanForce data if available, otherwise calculate it
                      const currentData = getCurrentEmployeeData();
                      let currentCompaRatio = 0;
                      if (currentData.compa_ratio) {
                        currentCompaRatio = currentData.compa_ratio;
                      } else {
                        const midpoint = paybandInfo?.kf_midpoint || paybandInfo?.wtw_midpoint || 0;
                        currentCompaRatio = midpoint > 0 ? currentData.current_salary / midpoint : 0;
                      }
                      const meritIncrease = calculateMeritIncrease(value, currentCompaRatio);
                      
                      setFormData({
                          ...formData, 
                          performance_rating: value,
                          merit_increase: meritIncrease
                        });
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select rating" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="BE">BE - Below Expectations</SelectItem>
                        <SelectItem value="OI">OI - Opportunity for Improvement</SelectItem>
                        <SelectItem value="ME">ME - Meets Expectations</SelectItem>
                        <SelectItem value="EE">EE - Exceeds Expectations</SelectItem>
                        <SelectItem value="O">O - Outstanding</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {formData.analysis_type !== 'external_candidate_initial' && (
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
                      {fetchingMacroData && <span className="text-sm text-muted-foreground">Fetching data...</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <Label className="text-xs whitespace-nowrap">Proposed Adjustment (50% of Total)</Label>
                      <Input
                        type="text"
                        step="0.01"
                        value={formData.proposed_adjustment ? parseFloat(formData.proposed_adjustment).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
                        disabled
                        className="bg-muted font-semibold w-24"
                      />
                    </div>
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
                      type="text"
                      step="0.01"
                      placeholder="e.g., 3.80"
                      value={formData.inflation_rate ? parseFloat(formData.inflation_rate).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""}
                      onChange={(e) => {
                        const value = e.target.value.replace(/,/g, '');
                        if (!isNaN(parseFloat(value)) || value === '') {
                          setFormData({ ...formData, inflation_rate: value });
                        }
                      }}
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
                      type="text"
                      step="0.0001"
                      placeholder="e.g., 0.9500"
                      value={formData.fx_rate_current ? parseFloat(formData.fx_rate_current).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : ""}
                      onChange={(e) => {
                        const newCurrent = e.target.value.replace(/,/g, '');
                        if (!isNaN(parseFloat(newCurrent)) || newCurrent === '') {
                          const previous = parseFloat(formData.fx_rate_previous) || 0;
                          const current = parseFloat(newCurrent) || 0;
                          const fxChange = previous > 0 ? ((current - previous) / previous) * 100 : 0;
                          const inflation = parseFloat(formData.inflation_rate) || 0;
                          const macroEffect = fxChange - inflation;
                          const adjustment = macroEffect * 0.5;
                          
                          setFormData({ 
                            ...formData, 
                            fx_rate_current: newCurrent,
                            fx_change_percent: fxChange.toFixed(2),
                            macroeconomic_effect: macroEffect.toFixed(2),
                            proposed_adjustment: adjustment.toFixed(2),
                          });
                        }
                      }}
                      disabled={fetchingMacroData}
                    />
                  </div>
                  
                  <div>
                    <Label className="text-xs">USD - Local Currency Rate (Last Year)</Label>
                    <Input
                      type="text"
                      step="0.0001"
                      placeholder="e.g., 0.9200"
                      value={formData.fx_rate_previous ? parseFloat(formData.fx_rate_previous).toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 }) : ""}
                      onChange={(e) => {
                        const newPrevious = e.target.value.replace(/,/g, '');
                        if (!isNaN(parseFloat(newPrevious)) || newPrevious === '') {
                          const previous = parseFloat(newPrevious) || 0;
                          const current = parseFloat(formData.fx_rate_current) || 0;
                          const fxChange = previous > 0 ? ((current - previous) / previous) * 100 : 0;
                          const inflation = parseFloat(formData.inflation_rate) || 0;
                          const macroEffect = fxChange - inflation;
                          const adjustment = macroEffect * 0.5;
                          
                          setFormData({ 
                            ...formData, 
                            fx_rate_previous: newPrevious,
                            fx_change_percent: fxChange.toFixed(2),
                            macroeconomic_effect: macroEffect.toFixed(2),
                            proposed_adjustment: adjustment.toFixed(2),
                          });
                        }
                      }}
                      disabled={fetchingMacroData}
                    />
                  </div>
                  
                  <div>
                    <Label className="text-xs">Currency Change (%)</Label>
                    <Input
                      type="text"
                      step="0.01"
                      value={formData.fx_change_percent ? parseFloat(formData.fx_change_percent).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                  
                  <div>
                    <Label className="text-xs">Total Macro Effect (%) = Currency Change + Inflation</Label>
                    <Input
                      type="text"
                      step="0.01"
                      value={formData.macroeconomic_effect ? parseFloat(formData.macroeconomic_effect).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}
                      disabled
                      className="bg-muted font-semibold"
                    />
                  </div>
                </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Proposed {formData.contract_type === "consultancy" ? "Fee" : "Salary"}</Label>
                <Input
                  type="text"
                  value={formData.proposed_salary ? parseFloat(formData.proposed_salary).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ""}
                  onChange={(e) => {
                    const value = e.target.value.replace(/,/g, '');
                    if (!isNaN(parseFloat(value)) || value === '') {
                      setFormData({ ...formData, proposed_salary: value });
                    }
                  }}
                  disabled={formData.analysis_type === 'external_candidate_initial'}
                  className={
                    formData.analysis_type !== 'external_candidate_initial' && 
                    getCurrentEmployeeData() && 
                    parseFloat(formData.proposed_salary) < getCurrentEmployeeData().current_salary
                      ? "border-destructive"
                      : ""
                  }
                />
                {formData.analysis_type !== 'external_candidate_initial' && getCurrentEmployeeData() && getCurrentEmployeeData().current_salary > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Total % increase: {(
                      (parseFloat(formData.merit_increase?.toString() || "0")) + 
                      (parseFloat(formData.proposed_adjustment || "0"))
                    ).toFixed(2)}%
                    {" = "}
                    {Math.ceil(
                      getCurrentEmployeeData().current_salary * 
                      (1 + ((parseFloat(formData.merit_increase?.toString() || "0")) + 
                      (parseFloat(formData.proposed_adjustment || "0"))) / 100)
                    ).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {getCurrentEmployeeData().currency || paybandInfo?.currency}
                  </p>
                )}
              </div>


              <div className="space-y-2">
                <Label>Additional Comment</Label>
                <Textarea
                  placeholder="Add any additional comments or notes"
                  value={formData.rationale}
                  onChange={(e) => setFormData({ ...formData, rationale: e.target.value })}
                  rows={4}
                />
              </div>

              <Button onClick={handleSave} disabled={loading}>
                <Save className="mr-2 h-4 w-4" />
                Save Analysis
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
