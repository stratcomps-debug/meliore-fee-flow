import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Check } from "lucide-react";

export const FCAVisualReport = () => {
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [selectedAnalysis, setSelectedAnalysis] = useState<any>(null);
  const [cohortData, setCohortData] = useState<any>(null);
  const [feeApprovalData, setFeeApprovalData] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadAnalyses();
  }, []);

  const loadAnalyses = async () => {
    const { data, error } = await supabase
      .from("fca_analyses")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      toast({ title: "Error loading analyses", variant: "destructive" });
    } else {
      setAnalyses(data || []);
    }
  };

  const handleAnalysisSelect = async (analysisId: string) => {
    const analysis = analyses.find((a) => a.id === analysisId);
    setSelectedAnalysis(analysis);

    if (analysis) {
      // Fetch cohort data for equity distance calculation
      const { data: cohortMembers } = await supabase
        .from("humanforce_data")
        .select("*")
        .eq("country", analysis.country)
        .eq("level", analysis.level);

      setCohortData(cohortMembers || []);

      // Fetch fee approval data
      const { data: feeApproval } = await supabase
        .from("fee_approvals")
        .select("*")
        .eq("fca_analysis_id", analysis.id)
        .maybeSingle();

      setFeeApprovalData(feeApproval);
    }
  };

  const calculateEquityDistance = () => {
    if (!cohortData || cohortData.length === 0) return { current: 0, proposed: 0 };
    
    const salaries = cohortData.map((m: any) => m.current_salary || 0);
    const maxSalary = Math.max(...salaries);
    const minSalary = Math.min(...salaries);
    
    const currentDistance = maxSalary > 0 ? ((maxSalary - minSalary) / maxSalary) * 100 : 0;
    
    // Calculate with proposed salary
    const proposedSalaries = [...salaries, selectedAnalysis?.proposed_salary || 0];
    const maxProposed = Math.max(...proposedSalaries);
    const minProposed = Math.min(...proposedSalaries);
    const proposedDistance = maxProposed > 0 ? ((maxProposed - minProposed) / maxProposed) * 100 : 0;
    
    return { current: currentDistance.toFixed(2), proposed: proposedDistance.toFixed(2) };
  };

  const calculateAverageCompaRatio = () => {
    if (!cohortData || cohortData.length === 0) return { current: 0, proposed: 0 };
    
    const avgCurrent = cohortData.reduce((sum: number, m: any) => sum + (m.compa_ratio || 0), 0) / cohortData.length;
    
    // Include proposed in calculation
    const totalCompa = cohortData.reduce((sum: number, m: any) => sum + (m.compa_ratio || 0), 0) + (selectedAnalysis?.compa_ratio_proposed || 0);
    const avgProposed = totalCompa / (cohortData.length + 1);
    
    return { current: (avgCurrent * 100).toFixed(2), proposed: (avgProposed * 100).toFixed(2) };
  };

  const getGenderGapAnalysis = () => {
    if (!cohortData || cohortData.length === 0) return "No data available";
    
    const males = cohortData.filter((m: any) => m.raw_data?.Gender === "Male");
    const females = cohortData.filter((m: any) => m.raw_data?.Gender === "Female");
    
    if (males.length === 0 || females.length === 0) return "Insufficient gender data for analysis";
    
    const avgMale = males.reduce((sum: number, m: any) => sum + (m.current_salary || 0), 0) / males.length;
    const avgFemale = females.reduce((sum: number, m: any) => sum + (m.current_salary || 0), 0) / females.length;
    
    const gap = ((avgMale - avgFemale) / avgMale) * 100;
    
    return `Gender pay gap: ${gap.toFixed(2)}% (${males.length} males, ${females.length} females)`;
  };

  if (!selectedAnalysis) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>FCA Visual Report</CardTitle>
          <CardDescription>Select an analysis to view the detailed report</CardDescription>
        </CardHeader>
        <CardContent>
          <Select onValueChange={handleAnalysisSelect}>
            <SelectTrigger>
              <SelectValue placeholder="Choose an analysis" />
            </SelectTrigger>
            <SelectContent>
              {analyses.map((analysis) => (
                <SelectItem key={analysis.id} value={analysis.id}>
                  {analysis.employee_name} - {analysis.country} ({new Date(analysis.created_at).toLocaleDateString()})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>
    );
  }

  const equityDistance = calculateEquityDistance();
  const avgCompaRatio = calculateAverageCompaRatio();
  const midpoint = selectedAnalysis.kf_midpoint || selectedAnalysis.wtw_midpoint || 0;
  const dataSource = selectedAnalysis.kf_midpoint ? "Korn Ferry" : "Towers Watson";

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>FCA Analysis Report</CardTitle>
          <CardDescription>
            {selectedAnalysis.employee_name} - {selectedAnalysis.country} - Level {selectedAnalysis.level}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Select onValueChange={handleAnalysisSelect} value={selectedAnalysis.id}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {analyses.map((analysis) => (
                  <SelectItem key={analysis.id} value={analysis.id}>
                    {analysis.employee_name} - {analysis.country} ({new Date(analysis.created_at).toLocaleDateString()})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40%]">Factors</TableHead>
                <TableHead className="w-[10%] text-center">Checklist</TableHead>
                <TableHead className="w-[50%]">Analysis</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <TableRow>
                <TableCell className="font-medium">
                  What is the approved budgeted amount confirmed by Finance Manager
                </TableCell>
                <TableCell className="text-center">
                  <Check className="h-4 w-4 mx-auto" />
                </TableCell>
                <TableCell>
                  Budgeted fee for this role of {feeApprovalData?.document_content?.budget_amount ? 
                    `${parseFloat(feeApprovalData.document_content.budget_amount).toLocaleString()} ${selectedAnalysis.currency}` : 
                    `${selectedAnalysis.proposed_salary?.toLocaleString()} ${selectedAnalysis.currency}`} per year.
                </TableCell>
              </TableRow>

              <TableRow>
                <TableCell className="font-medium">
                  Link of proposed offer to our compensation & comparatio philosophy, principles, methodology, circumstances etc
                </TableCell>
                <TableCell className="text-center">
                  <Check className="h-4 w-4 mx-auto" />
                </TableCell>
                <TableCell>
                  "Our philosophy is to manage pay around the midpoint of the pay band or the 75th percentile of the market data. 
                  The current 75th percentile for a Meliore Level {selectedAnalysis.level} in {selectedAnalysis.country} is {midpoint?.toLocaleString()} {selectedAnalysis.currency} 
                  (which is also 100% Compa-ratio). The source of the data is {dataSource} and values date from {new Date().getFullYear()}.
                  
                  {selectedAnalysis.employee_name} is a fully functional experienced staff - based on qualifications, skills and experience, 
                  P&C proposes to pay {selectedAnalysis.proposed_salary?.toLocaleString()} {selectedAnalysis.currency} per year which equals to a Compa-ratio of {selectedAnalysis.compa_ratio_proposed?.toFixed(0)}%. 
                  This is within the budgeted fee for this role.
                  
                  {selectedAnalysis.rationale ? `\n\nRationale: ${selectedAnalysis.rationale}` : ''}"
                </TableCell>
              </TableRow>

              <TableRow>
                <TableCell className="font-medium">
                  Our cohort reference group equity distance standard is 10% ie the difference between the highest and lowest member of a cohort/referent group is 10% as a rule; with flexibility up to 15% depending on dynamics of cohort and JEDI
                </TableCell>
                <TableCell className="text-center">
                  <Check className="h-4 w-4 mx-auto" />
                </TableCell>
                <TableCell>
                  "We currently have {cohortData?.length || 0} staff members on a Meliore Level {selectedAnalysis.level} in {selectedAnalysis.country}.
                  The equity distance for the {cohortData?.length || 0} staff members is {equityDistance.current}%.
                  If we offer our proposition, the new equity distance is {equityDistance.proposed}%."
                </TableCell>
              </TableRow>

              <TableRow>
                <TableCell className="font-medium">
                  Analysis of referent groups/cohorts in the level under review
                </TableCell>
                <TableCell className="text-center">
                  <Check className="h-4 w-4 mx-auto" />
                </TableCell>
                <TableCell>
                  "From the staff members on Meliore grading Level {selectedAnalysis.level} in {selectedAnalysis.country}, 
                  {cohortData?.length || 0} staff members are currently in this cohort."
                </TableCell>
              </TableRow>

              <TableRow>
                <TableCell className="font-medium">
                  What is the average CR of the cohort/reference group under review
                </TableCell>
                <TableCell className="text-center">
                  <Check className="h-4 w-4 mx-auto" />
                </TableCell>
                <TableCell>
                  The average Compa-Ratio for all staff on a Meliore Grading level {selectedAnalysis.level} in {selectedAnalysis.country} is {avgCompaRatio.current}%. 
                  The average Compa-Ratio becomes {avgCompaRatio.proposed}% with this proposition.
                </TableCell>
              </TableRow>

              <TableRow>
                <TableCell className="font-medium">
                  Any gender gaps
                </TableCell>
                <TableCell className="text-center">
                  <Check className="h-4 w-4 mx-auto" />
                </TableCell>
                <TableCell>
                  {getGenderGapAnalysis()}
                </TableCell>
              </TableRow>

              <TableRow>
                <TableCell className="font-medium">
                  Macroeconomic analysis
                </TableCell>
                <TableCell className="text-center">
                  <Check className="h-4 w-4 mx-auto" />
                </TableCell>
                <TableCell>
                  {(() => {
                    const docContent = feeApprovalData?.document_content;
                    const fxCurrent = docContent?.formData?.fx_rate_current;
                    const fxPrevious = docContent?.formData?.fx_rate_previous;
                    const fxChange = docContent?.formData?.fx_change_percent;
                    const inflationRate = selectedAnalysis.inflation_rate;
                    const macroEffect = docContent?.formData?.macroeconomic_effect;
                    const proposedAdj = docContent?.formData?.proposed_adjustment;
                    const currentYear = new Date().getFullYear();
                    const previousYear = currentYear - 1;
                    
                    return (
                      <div className="space-y-2">
                        <p>
                          "According to the latest Trading Economics data, the 12 months Inflation rate in{" "}
                          {selectedAnalysis.country} is {inflationRate || "N/A"}% in {currentYear}.
                        </p>
                        {selectedAnalysis.currency !== "USD" && fxCurrent && fxPrevious && (
                          <>
                            <p>
                              On average in {currentYear}, 1 USD allowed our staff members to obtain{" "}
                              {fxCurrent} {selectedAnalysis.currency}.
                            </p>
                            <p>
                              On average in {previousYear}, 1 USD allowed our staff members to obtain{" "}
                              {fxPrevious} {selectedAnalysis.currency}.
                            </p>
                            <p>
                              In conclusion: on average in {currentYear}, 1 USD allowed our staff members to obtain{" "}
                              {parseFloat(fxChange || "0") > 0 ? "more" : "less"} {selectedAnalysis.currency} than in {previousYear}{" "}
                              ({Math.abs(parseFloat(fxChange || "0")).toFixed(2)}% {parseFloat(fxChange || "0") > 0 ? "increase" : "decrease"}).
                            </p>
                          </>
                        )}
                        {macroEffect && proposedAdj && (
                          <p className="font-semibold">
                            The total macroeconomic effect (Inflation + FX fluctuation) is {macroEffect}%.
                            Meliore proposes to cover 50% of this effect, resulting in a {proposedAdj}% salary adjustment."
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </TableCell>
              </TableRow>

              {selectedAnalysis.recommendation && (
                <TableRow>
                  <TableCell className="font-medium">
                    Recommendation
                  </TableCell>
                  <TableCell className="text-center">
                    <Check className="h-4 w-4 mx-auto" />
                  </TableCell>
                  <TableCell>
                    {selectedAnalysis.recommendation}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};
