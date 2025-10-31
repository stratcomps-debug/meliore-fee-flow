import { useState, useEffect } from "react";
import { differenceInMonths, differenceInYears } from "date-fns";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Check, FileDown, Trash2 } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Document, Packer, Paragraph, TextRun, Table as DocxTable, TableRow as DocxTableRow, TableCell as DocxTableCell, WidthType, AlignmentType, BorderStyle } from "docx";
import { saveAs } from "file-saver";
import * as XLSX from "xlsx";

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
    
    return { current: currentDistance, proposed: proposedDistance };
  };

  const calculateAverageCompaRatio = () => {
    if (!cohortData || cohortData.length === 0) return { current: 0, proposed: 0 };
    
    const avgCurrent = cohortData.reduce((sum: number, m: any) => sum + (m.compa_ratio || 0), 0) / cohortData.length;
    
    // Include proposed in calculation
    const totalCompa = cohortData.reduce((sum: number, m: any) => sum + (m.compa_ratio || 0), 0) + (selectedAnalysis?.compa_ratio_proposed || 0);
    const avgProposed = totalCompa / (cohortData.length + 1);
    
    return { current: avgCurrent * 100, proposed: avgProposed * 100 };
  };

  const getGenderGapAnalysis = () => {
    if (!cohortData || cohortData.length === 0) return "No data available";
    
    const males = cohortData.filter((m: any) => m.raw_data?.Gender === "Male");
    const females = cohortData.filter((m: any) => m.raw_data?.Gender === "Female");
    
    if (males.length === 0 || females.length === 0) return "Insufficient gender data for analysis";
    
    const avgMale = males.reduce((sum: number, m: any) => sum + (m.current_salary || 0), 0) / males.length;
    const avgFemale = females.reduce((sum: number, m: any) => sum + (m.current_salary || 0), 0) / females.length;
    
    const gap = ((avgMale - avgFemale) / avgMale) * 100;
    
    return `Gender pay gap: ${Math.ceil(gap)}% (${males.length} males, ${females.length} females)`;
  };

  const calculateYearsWithOrganisation = (hireDate: string | null): string => {
    if (!hireDate) return "N/A";
    
    const start = new Date(hireDate);
    const today = new Date();
    
    const years = differenceInYears(today, start);
    const totalMonths = differenceInMonths(today, start);
    const months = totalMonths - (years * 12);
    
    return `${years} years and ${months} months`;
  };

  const handleDeleteAnalysis = async () => {
    if (!selectedAnalysis) return;

    const { error } = await supabase
      .from("fca_analyses")
      .delete()
      .eq("id", selectedAnalysis.id);

    if (error) {
      toast({ 
        title: "Error deleting analysis", 
        description: error.message,
        variant: "destructive" 
      });
    } else {
      toast({ 
        title: "Analysis deleted", 
        description: "The report has been successfully deleted" 
      });
      setSelectedAnalysis(null);
      setCohortData(null);
      setFeeApprovalData(null);
      await loadAnalyses();
    }
  };

  const handleExportToWord = async () => {
    if (!selectedAnalysis) return;

    // Fetch humanforce data for hire_date and gender
    const { data: humanforceData } = await supabase
      .from("humanforce_data")
      .select("*")
      .eq("id", selectedAnalysis.humanforce_record_id)
      .maybeSingle();

    const midpoint = selectedAnalysis.kf_midpoint || selectedAnalysis.wtw_midpoint || 0;
    const dataSource = selectedAnalysis.kf_midpoint ? "Korn Ferry" : "Towers Watson";
    const dataYear = selectedAnalysis.kf_midpoint ? 2024 : 2025;
    const equityDistance = calculateEquityDistance();
    const avgCompaRatio = calculateAverageCompaRatio();
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;
    
    // Get gender pronoun
    const rawData = humanforceData?.raw_data as any;
    const gender = rawData?.Gender || rawData?.gender;
    const pronoun = gender?.toLowerCase() === "male" ? "he" : gender?.toLowerCase() === "female" ? "she" : "they";
    
    // Format hire date
    const hireDate = humanforceData?.hire_date ? new Date(humanforceData.hire_date) : null;
    const hireDateFormatted = hireDate ? hireDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : "N/A";
    const yearsWithOrg = hireDate ? calculateYearsWithOrganisation(humanforceData.hire_date) : "N/A";

    const docContent = feeApprovalData?.document_content;
    const fxCurrent = docContent?.formData?.fx_rate_current;
    const fxPrevious = docContent?.formData?.fx_rate_previous;
    const fxChange = docContent?.formData?.fx_change_percent;
    const macroEffect = docContent?.formData?.macroeconomic_effect;
    const proposedAdj = docContent?.formData?.proposed_adjustment;

    const doc = new Document({
      sections: [{
        properties: {},
        children: [
          new Paragraph({
            text: "FCA Analysis Report",
            heading: "Heading1",
            alignment: AlignmentType.CENTER,
          }),
          new Paragraph({
            text: `${selectedAnalysis.employee_name} - ${selectedAnalysis.country} - Level ${selectedAnalysis.level}`,
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 },
          }),
          
          // Budgeted Amount
          new Paragraph({
            children: [new TextRun({ text: "Budgeted Amount", bold: true, size: 28 })],
            spacing: { before: 200, after: 100 },
          }),
          new Paragraph({
            text: `Budgeted ${selectedAnalysis.contract_type === "consultancy" ? "fee" : "salary"} for this role of ${feeApprovalData?.document_content?.budget_amount ? 
              `${Math.ceil(parseFloat(feeApprovalData.document_content.budget_amount)).toLocaleString()} ${selectedAnalysis.currency}` : 
              `${Math.ceil(selectedAnalysis.proposed_salary).toLocaleString()} ${selectedAnalysis.currency}`} per year.${selectedAnalysis.contract_type === "consultancy" ? " (6% increase from current fee)" : ""}`,
            spacing: { after: 200 },
          }),

          // Compensation Philosophy
          new Paragraph({
            children: [new TextRun({ text: "Compensation Philosophy & Proposed Salary", bold: true, size: 28 })],
            spacing: { before: 200, after: 100 },
          }),
          new Paragraph({
            text: `Our philosophy is to manage pay around the midpoint of the pay band or the 75th percentile of the market data. The current 75th percentile for a Meliore Level ${selectedAnalysis.level} in ${selectedAnalysis.country} is ${Math.ceil(midpoint).toLocaleString()} ${selectedAnalysis.currency} (which is also 100% Compa-ratio).`,
            spacing: { after: 100 },
          }),
          new Paragraph({
            text: `${selectedAnalysis.employee_name} has been with the organisation for ${yearsWithOrg}, ${pronoun} joined in ${hireDateFormatted}.`,
            spacing: { after: 100 },
          }),
          new Paragraph({
            text: `${selectedAnalysis.employee_name} is a fully functional experienced staff - based on qualifications, skills and experience, P&C proposes to pay ${Math.ceil(selectedAnalysis.proposed_salary).toLocaleString()} ${selectedAnalysis.currency} per year which equals to a Compa-ratio of ${Math.ceil(selectedAnalysis.compa_ratio_proposed)}%. This is within the budgeted ${selectedAnalysis.contract_type === "consultancy" ? "fee" : "salary"} for this role.`,
            spacing: { after: selectedAnalysis.rationale ? 100 : 200 },
          }),
          ...(selectedAnalysis.rationale ? [
            new Paragraph({
              text: `Rationale: ${selectedAnalysis.rationale}`,
              spacing: { after: 200 },
            })
          ] : []),

          // Equity Distance
          new Paragraph({
            children: [new TextRun({ text: "Equity Distance Analysis", bold: true, size: 28 })],
            spacing: { before: 200, after: 100 },
          }),
          new Paragraph({
            text: `We currently have ${cohortData?.length || 0} staff members on a Meliore Level ${selectedAnalysis.level} in ${selectedAnalysis.country}. The equity distance for the ${cohortData?.length || 0} staff members is ${Math.ceil(equityDistance.current)}%. If we offer our proposition, the new equity distance is ${Math.ceil(equityDistance.proposed)}%.`,
            spacing: { after: 200 },
          }),

          // Cohort Analysis
          new Paragraph({
            children: [new TextRun({ text: "Cohort Reference Group", bold: true, size: 28 })],
            spacing: { before: 200, after: 100 },
          }),
          new Paragraph({
            text: `From the staff members on Meliore grading Level ${selectedAnalysis.level} in ${selectedAnalysis.country}, ${cohortData?.length || 0} staff members are currently in this cohort.`,
            spacing: { after: 200 },
          }),

          // Average Compa-Ratio
          new Paragraph({
            children: [new TextRun({ text: "Average Compa-Ratio", bold: true, size: 28 })],
            spacing: { before: 200, after: 100 },
          }),
          new Paragraph({
            text: `The average Compa-Ratio for all staff on a Meliore Grading level ${selectedAnalysis.level} in ${selectedAnalysis.country} is ${Math.ceil(avgCompaRatio.current)}%. The average Compa-Ratio becomes ${Math.ceil(avgCompaRatio.proposed)}% with this proposition.`,
            spacing: { after: 200 },
          }),

          // Gender Gap
          new Paragraph({
            children: [new TextRun({ text: "Gender Gap Analysis", bold: true, size: 28 })],
            spacing: { before: 200, after: 100 },
          }),
          new Paragraph({
            text: getGenderGapAnalysis(),
            spacing: { after: 200 },
          }),

          // Macroeconomic Analysis
          new Paragraph({
            children: [new TextRun({ text: "Macroeconomic Analysis", bold: true, size: 28 })],
            spacing: { before: 200, after: 100 },
          }),
          new Paragraph({
            text: `According to the latest Trading Economics data, the 12 months Inflation rate in ${selectedAnalysis.country} is ${selectedAnalysis.inflation_rate || "N/A"}% in ${currentYear}.`,
            spacing: { after: 100 },
          }),
          ...(selectedAnalysis.currency !== "USD" && fxCurrent && fxPrevious ? [
            new Paragraph({
              text: `On average in ${currentYear}, 1 USD allowed our staff members to obtain ${fxCurrent} ${selectedAnalysis.currency}.`,
              spacing: { after: 100 },
            }),
            new Paragraph({
              text: `On average in ${previousYear}, 1 USD allowed our staff members to obtain ${fxPrevious} ${selectedAnalysis.currency}.`,
              spacing: { after: 100 },
            }),
            new Paragraph({
              text: `In conclusion: on average in ${currentYear}, 1 USD allowed our staff members to obtain ${parseFloat(fxChange || "0") > 0 ? "more" : "less"} ${selectedAnalysis.currency} than in ${previousYear} (${Math.ceil(Math.abs(parseFloat(fxChange || "0")))}% ${parseFloat(fxChange || "0") > 0 ? "increase" : "decrease"}).`,
              spacing: { after: 100 },
            })
          ] : []),
          ...(macroEffect && proposedAdj ? [
            new Paragraph({
              children: [new TextRun({ 
                text: `The total macroeconomic effect (Inflation + FX fluctuation) is ${Math.ceil(parseFloat(macroEffect))}%. Meliore proposes to cover 50% of this effect, resulting in a ${Math.ceil(parseFloat(proposedAdj))}% salary adjustment.`,
                bold: true 
              })],
              spacing: { after: 200 },
            })
          ] : []),

          // Recommendation
          ...(selectedAnalysis.recommendation ? [
            new Paragraph({
              children: [new TextRun({ text: "Recommendation", bold: true, size: 28 })],
              spacing: { before: 200, after: 100 },
            }),
            new Paragraph({
              text: selectedAnalysis.recommendation,
              spacing: { after: 200 },
            })
          ] : []),
        ],
      }],
    });

    const blob = await Packer.toBlob(doc);
    saveAs(blob, `FCA_Report_${selectedAnalysis.employee_name}_${new Date().toISOString().split('T')[0]}.docx`);
    
    toast({
      title: "Report exported",
      description: "Word document has been downloaded",
    });
  };

  const handleExportToExcel = () => {
    if (!selectedAnalysis) return;

    const midpoint = selectedAnalysis.kf_midpoint || selectedAnalysis.wtw_midpoint || 0;
    const dataSource = selectedAnalysis.kf_midpoint ? "Korn Ferry" : "Towers Watson";
    const dataYear = selectedAnalysis.kf_midpoint ? 2024 : 2025;
    const equityDistance = calculateEquityDistance();
    const avgCompaRatio = calculateAverageCompaRatio();
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;

    const docContent = feeApprovalData?.document_content;
    const fxCurrent = docContent?.formData?.fx_rate_current;
    const fxPrevious = docContent?.formData?.fx_rate_previous;
    const fxChange = docContent?.formData?.fx_change_percent;
    const macroEffect = docContent?.formData?.macroeconomic_effect;
    const proposedAdj = docContent?.formData?.proposed_adjustment;

    // Fetch humanforce record to get hire_date
    const getHumanForceData = async () => {
      const { data } = await supabase
        .from("humanforce_data")
        .select("*")
        .eq("id", selectedAnalysis.humanforce_record_id)
        .maybeSingle();
      return data;
    };

    getHumanForceData().then((humanforceData) => {
      const exportData = [
        { Section: "FCA ANALYSIS REPORT", Details: "" },
        { Section: "Employee", Details: selectedAnalysis.employee_name },
        { Section: "Country", Details: selectedAnalysis.country },
        { Section: "Level", Details: selectedAnalysis.level },
        { Section: "Staff Start Date", Details: humanforceData?.hire_date ? new Date(humanforceData.hire_date).toLocaleDateString() : "N/A" },
        { Section: "Years with Organisation", Details: humanforceData?.hire_date ? calculateYearsWithOrganisation(humanforceData.hire_date) : "N/A" },
        { Section: "", Details: "" },
        
        { Section: "BUDGETED AMOUNT", Details: "" },
        { Section: "Analysis", Details: `Budgeted ${selectedAnalysis.contract_type === "consultancy" ? "fee" : "salary"} for this role of ${Math.ceil(selectedAnalysis.proposed_salary).toLocaleString()} ${selectedAnalysis.currency} per year.${selectedAnalysis.contract_type === "consultancy" ? " (6% increase from current fee)" : ""}` },
        { Section: "", Details: "" },
        
        { Section: "COMPENSATION PHILOSOPHY", Details: "" },
        { Section: "Market Data Source", Details: dataSource },
        { Section: "75th Percentile (100% CR)", Details: `${Math.ceil(midpoint).toLocaleString()} ${selectedAnalysis.currency}` },
        { Section: "Current Salary", Details: `${Math.ceil(selectedAnalysis.current_salary).toLocaleString()} ${selectedAnalysis.currency}` },
        { Section: "Proposed Salary", Details: `${Math.ceil(selectedAnalysis.proposed_salary).toLocaleString()} ${selectedAnalysis.currency}` },
        { Section: "Current Compa-Ratio", Details: `${Math.ceil(selectedAnalysis.compa_ratio_current)}%` },
        { Section: "Proposed Compa-Ratio", Details: `${Math.ceil(selectedAnalysis.compa_ratio_proposed)}%` },
        { Section: "Rationale", Details: selectedAnalysis.rationale || "N/A" },
        { Section: "", Details: "" },
        
        { Section: "EQUITY DISTANCE ANALYSIS", Details: "" },
        { Section: "Cohort Size", Details: cohortData?.length || 0 },
        { Section: "Current Equity Distance", Details: `${Math.ceil(equityDistance.current)}%` },
        { Section: "Proposed Equity Distance", Details: `${Math.ceil(equityDistance.proposed)}%` },
        { Section: "", Details: "" },
        
        { Section: "AVERAGE COMPA-RATIO", Details: "" },
        { Section: "Current Average CR", Details: `${Math.ceil(avgCompaRatio.current)}%` },
        { Section: "Proposed Average CR", Details: `${Math.ceil(avgCompaRatio.proposed)}%` },
        { Section: "", Details: "" },
        
        { Section: "GENDER GAP ANALYSIS", Details: "" },
        { Section: "Analysis", Details: getGenderGapAnalysis() },
        { Section: "", Details: "" },
        
        { Section: "MACROECONOMIC ANALYSIS", Details: "" },
        { Section: "Inflation Rate", Details: `${selectedAnalysis.inflation_rate || "N/A"}%` },
        ...(selectedAnalysis.currency !== "USD" && fxCurrent && fxPrevious ? [
          { Section: `FX Rate ${currentYear}`, Details: `${fxCurrent} ${selectedAnalysis.currency}` },
          { Section: `FX Rate ${previousYear}`, Details: `${fxPrevious} ${selectedAnalysis.currency}` },
          { Section: "FX Change", Details: `${Math.ceil(Math.abs(parseFloat(fxChange || "0")))}% ${parseFloat(fxChange || "0") > 0 ? "increase" : "decrease"}` },
        ] : []),
        ...(macroEffect && proposedAdj ? [
          { Section: "Total Macro Effect", Details: `${Math.ceil(parseFloat(macroEffect))}%` },
          { Section: "Proposed Adjustment (50%)", Details: `${Math.ceil(parseFloat(proposedAdj))}%` },
        ] : []),
        { Section: "", Details: "" },
        
        ...(selectedAnalysis.recommendation ? [
          { Section: "RECOMMENDATION", Details: "" },
          { Section: "Analysis", Details: selectedAnalysis.recommendation },
        ] : []),
      ];

      const ws = XLSX.utils.json_to_sheet(exportData);
      
      // Set column widths
      ws['!cols'] = [
        { wch: 30 },  // Section column
        { wch: 80 },  // Details column
      ];

      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "FCA Report");
      XLSX.writeFile(wb, `FCA_Report_${selectedAnalysis.employee_name}_${new Date().toISOString().split('T')[0]}.xlsx`);

      toast({
        title: "Report exported",
        description: "Excel file has been downloaded",
      });
    });
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
  const dataYear = selectedAnalysis.kf_midpoint ? 2024 : 2025;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>FCA Analysis Report</CardTitle>
              <CardDescription>
                {selectedAnalysis.employee_name} - {selectedAnalysis.country} - Level {selectedAnalysis.level}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button onClick={handleExportToWord} variant="outline" size="sm">
                <FileDown className="h-4 w-4 mr-2" />
                Export to Word
              </Button>
              <Button onClick={handleExportToExcel} variant="outline" size="sm">
                <FileDown className="h-4 w-4 mr-2" />
                Export to Excel
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Analysis Report</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete this analysis for {selectedAnalysis.employee_name}? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDeleteAnalysis}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
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
                  What is the approved budgeted amount confirmed by Finance and P&C
                </TableCell>
                <TableCell className="text-center">
                  <Check className="h-4 w-4 mx-auto" />
                </TableCell>
                <TableCell>
                  Budgeted {selectedAnalysis.contract_type === "consultancy" ? "fee" : "salary"} for this role of {feeApprovalData?.document_content?.budget_amount ? 
                    `${Math.ceil(parseFloat(feeApprovalData.document_content.budget_amount)).toLocaleString()} ${selectedAnalysis.currency}` : 
                    `${Math.ceil(selectedAnalysis.proposed_salary).toLocaleString()} ${selectedAnalysis.currency}`} per year.
                  {selectedAnalysis.contract_type === "consultancy" && (
                    <span className="text-muted-foreground text-sm block mt-1">
                      (6% increase from current fee)
                    </span>
                  )}
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
                  The current 75th percentile for a Meliore Level {selectedAnalysis.level} in {selectedAnalysis.country} is {Math.ceil(midpoint).toLocaleString()} {selectedAnalysis.currency} 
                  (which is also 100% Compa-ratio). The source of the data is {dataSource} and values date from {dataYear}.
                  
                  {selectedAnalysis.employee_name} is a fully functional experienced staff - based on qualifications, skills and experience, 
                  P&C proposes to pay {Math.ceil(selectedAnalysis.proposed_salary).toLocaleString()} {selectedAnalysis.currency} per year which equals to a Compa-ratio of {Math.ceil(selectedAnalysis.compa_ratio_proposed)}%. 
                  This is within the budgeted {selectedAnalysis.contract_type === "consultancy" ? "fee" : "salary"} for this role.
                  
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
                  The equity distance for the {cohortData?.length || 0} staff members is {Math.ceil(equityDistance.current)}%.
                  If we offer our proposition, the new equity distance is {Math.ceil(equityDistance.proposed)}%."
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
                  The average Compa-Ratio for all staff on a Meliore Grading level {selectedAnalysis.level} in {selectedAnalysis.country} is {Math.ceil(avgCompaRatio.current)}%. 
                  The average Compa-Ratio becomes {Math.ceil(avgCompaRatio.proposed)}% with this proposition.
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
                               ({Math.ceil(Math.abs(parseFloat(fxChange || "0")))}% {parseFloat(fxChange || "0") > 0 ? "increase" : "decrease"}).
                             </p>
                          </>
                        )}
                         {macroEffect && proposedAdj && (
                           <p className="font-semibold">
                             The total macroeconomic effect (Inflation + FX fluctuation) is {Math.ceil(parseFloat(macroEffect))}%.
                             Meliore proposes to cover 50% of this effect, resulting in a {Math.ceil(parseFloat(proposedAdj))}% salary adjustment."
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
