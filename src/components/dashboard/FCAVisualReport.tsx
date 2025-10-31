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
      // Fetch cohort data based on contract type
      // Both employees and consultants come from humanforce_data
      let employmentConditionFilter;
      
      if (analysis.contract_type === 'consultancy') {
        // For consultants, filter by Consultancy Contract
        employmentConditionFilter = 'Consultancy Contract';
      } else {
        // For employees, filter by Employment Contract
        employmentConditionFilter = 'Employment Contract';
      }

      const { data: cohortMembers } = await supabase
        .from("humanforce_data")
        .select("*")
        .eq("country", analysis.country)
        .eq("level", analysis.level)
        .eq("employment_condition", employmentConditionFilter);

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
    if (!cohortData || cohortData.length === 0) return { current: 0, proposed: 0, count: 0, contractType: '' };
    
    // X = total cohort count including the current staff member
    const staffCount = cohortData.length;
    
    // Calculate current equity distance (A) - based on ALL staff including current member with their CURRENT CR
    const allCompaRatios = cohortData.map((m: any) => m.compa_ratio || 0);
    
    const maxCompaRatio = Math.max(...allCompaRatios);
    const minCompaRatio = Math.min(...allCompaRatios);
    
    // A = difference between highest and lowest compa-ratio (including current staff's current CR)
    const currentDistance = maxCompaRatio - minCompaRatio;
    
    // Calculate proposed equity distance (Y) - replace current staff member's CR with proposed CR
    // Build the new set of compa-ratios: all staff except current, then add the proposed CR
    const otherStaffMembers = cohortData.filter((m: any) => 
      m.employee_name !== selectedAnalysis?.employee_name
    );
    
    const proposedCompaRatios = otherStaffMembers.map((m: any) => m.compa_ratio || 0);
    // Convert proposed CR from percentage to decimal (stored as 100.65 instead of 1.0065)
    const proposedCR = (selectedAnalysis?.compa_ratio_proposed || 0) / 100;
    
    console.log('Equity Distance Debug:', {
      staffCount,
      allStaff: cohortData.map(m => ({ name: m.employee_name, cr: m.compa_ratio })),
      currentAnalysis: selectedAnalysis?.employee_name,
      proposedCR,
      allCompaRatios,
      maxCompaRatio,
      minCompaRatio,
      currentDistance
    });
    
    proposedCompaRatios.push(proposedCR);
    
    const maxProposedCompa = Math.max(...proposedCompaRatios);
    const minProposedCompa = Math.min(...proposedCompaRatios);
    
    console.log('Proposed calculation:', {
      proposedCompaRatios,
      maxProposedCompa,
      minProposedCompa,
      proposedDistance: (maxProposedCompa - minProposedCompa) * 100
    });
    
    // Y = difference after updating the staff member's compa-ratio
    const proposedDistance = maxProposedCompa - minProposedCompa;
    
    return { 
      current: currentDistance * 100, // Convert to percentage
      proposed: proposedDistance * 100, // Convert to percentage
      count: staffCount,
      contractType: selectedAnalysis?.contract_type === 'consultancy' ? 'consultants' : 'employees'
    };
  };

  const calculatePeerGroupAnalysis = () => {
    if (!cohortData || cohortData.length === 0 || !selectedAnalysis) {
      return { peerCount: 0, averageCR: 0 };
    }

    // Determine the bracket for the current analysis
    const proposedCR = (selectedAnalysis.compa_ratio_proposed || 0) / 100;
    
    const getBracket = (cr: number) => {
      if (cr < 0.95) return 'below95';
      if (cr >= 0.95 && cr < 1.05) return '95to105';
      return 'above105';
    };

    const currentBracket = getBracket(proposedCR);

    // Filter peers in the same bracket (excluding current staff member)
    const peers = cohortData.filter((m: any) => {
      if (m.employee_name === selectedAnalysis.employee_name) return false;
      const peerCR = m.compa_ratio || 0;
      return getBracket(peerCR) === currentBracket;
    });

    // Calculate average CR of peers
    const averageCR = peers.length > 0
      ? peers.reduce((sum: number, peer: any) => sum + (peer.compa_ratio || 0), 0) / peers.length
      : 0;

    return {
      peerCount: peers.length,
      averageCR: averageCR * 100 // Convert to percentage
    };
  };

  const calculateAverageCompaRatio = () => {
    if (!cohortData || cohortData.length === 0) return { current: 0, proposed: 0 };
    
    const avgCurrent = cohortData.reduce((sum: number, m: any) => sum + (m.compa_ratio || 0), 0) / cohortData.length;
    
    // Exclude current person from cohort, then add their proposed CR
    const othersData = cohortData.filter((m: any) => m.employee_name !== selectedAnalysis?.employee_name);
    const totalCompa = othersData.reduce((sum: number, m: any) => sum + (m.compa_ratio || 0), 0) + ((selectedAnalysis?.compa_ratio_proposed || 0) / 100);
    const avgProposed = totalCompa / (othersData.length + 1);
    
    return { current: avgCurrent * 100, proposed: avgProposed * 100 };
  };

  const calculateCohortAnalysis = () => {
    if (!cohortData || cohortData.length === 0 || !selectedAnalysis) {
      return { cohortCount: 0, averageCR: 0, supervisorName: 'N/A', cohortMembers: [] };
    }

    // Get supervisor name from the analysis or from fee approval data
    const employeeData = feeApprovalData?.document_content?.employee;
    const rawData = employeeData?.raw_data as any;
    const supervisorName = rawData?.["Supervisor Name"] || rawData?.supervisor || 'N/A';

    // Filter cohort members who report to the same supervisor (excluding current staff member)
    const cohortUnderSameSupervisor = cohortData.filter((m: any) => {
      if (m.employee_name === selectedAnalysis.employee_name) return false;
      const memberSupervisor = m.raw_data?.["Supervisor Name"] || m.raw_data?.supervisor;
      return memberSupervisor === supervisorName;
    });

    // Calculate average CR of cohort under same supervisor
    const averageCR = cohortUnderSameSupervisor.length > 0
      ? cohortUnderSameSupervisor.reduce((sum: number, member: any) => sum + (member.compa_ratio || 0), 0) / cohortUnderSameSupervisor.length
      : 0;

    return {
      cohortCount: cohortUnderSameSupervisor.length,
      averageCR: averageCR * 100, // Convert to percentage
      supervisorName,
      cohortMembers: cohortUnderSameSupervisor
    };
  };

  const getGenderGapAnalysis = () => {
    if (!cohortData || cohortData.length === 0 || !selectedAnalysis) return "No data available";
    
    const males = cohortData.filter((m: any) => m.raw_data?.Gender === "Male");
    const females = cohortData.filter((m: any) => m.raw_data?.Gender === "Female");
    
    if (males.length === 0 && females.length === 0) return "Insufficient gender data for analysis";
    
    const avgMaleCR = males.length > 0 
      ? (males.reduce((sum: number, m: any) => sum + (m.compa_ratio || 0), 0) / males.length) * 100
      : 0;
    const avgFemaleCR = females.length > 0 
      ? (females.reduce((sum: number, m: any) => sum + (m.compa_ratio || 0), 0) / females.length) * 100
      : 0;
    
    const payGap = Math.abs(avgFemaleCR - avgMaleCR);
    const gapFavour = avgFemaleCR > avgMaleCR ? "female" : "male";
    
    let genderText = `We currently have ${females.length} female staff and ${males.length} male staff on a Meliore Level ${selectedAnalysis.level} in ${selectedAnalysis.country}.`;
    
    if (males.length > 0 && females.length > 0) {
      genderText += ` The average Compa-ratio for female staff is ${Math.ceil(avgFemaleCR)}% and the average Compa-ratio for male staff is ${Math.ceil(avgMaleCR)}%. This means the pay gap is ${Math.ceil(payGap)}% in favour of ${gapFavour} staff on the level ${selectedAnalysis.level} in the ${selectedAnalysis.country}.`;
    }
    
    // Check if there are peers identified
    const peerGroup = calculatePeerGroupAnalysis();
    if (peerGroup.peerCount > 0) {
      // Get peers
      const proposedCR = (selectedAnalysis.compa_ratio_proposed || 0) / 100;
      const getBracket = (cr: number) => {
        if (cr < 0.95) return 'below95';
        if (cr >= 0.95 && cr < 1.05) return '95to105';
        return 'above105';
      };
      const currentBracket = getBracket(proposedCR);
      const peers = cohortData.filter((m: any) => {
        if (m.employee_name === selectedAnalysis.employee_name) return false;
        const peerCR = m.compa_ratio || 0;
        return getBracket(peerCR) === currentBracket;
      });
      
      const peerMales = peers.filter((m: any) => m.raw_data?.Gender === "Male");
      const peerFemales = peers.filter((m: any) => m.raw_data?.Gender === "Female");
      
      if (peerMales.length > 0 && peerFemales.length > 0) {
        const peerAvgMaleCR = (peerMales.reduce((sum: number, m: any) => sum + (m.compa_ratio || 0), 0) / peerMales.length) * 100;
        const peerAvgFemaleCR = (peerFemales.reduce((sum: number, m: any) => sum + (m.compa_ratio || 0), 0) / peerFemales.length) * 100;
        const peerPayGap = Math.abs(peerAvgFemaleCR - peerAvgMaleCR);
        const peerGapFavour = peerAvgFemaleCR > peerAvgMaleCR ? "female" : "male";
        
        genderText += `\n\nThe ${peerGroup.peerCount} peers who have an average CR of ${Math.ceil(peerGroup.averageCR)}% have a gender pay gap of ${Math.ceil(peerPayGap)}% in favour of ${peerGapFavour} staff.`;
        
        // Calculate proposed gap with the new person
        const proposedPeerMales = [...peerMales];
        const proposedPeerFemales = [...peerFemales];
        
        // Add the current analysis to the appropriate gender group
        const currentGender = cohortData.find((m: any) => m.employee_name === selectedAnalysis.employee_name)?.raw_data?.Gender;
        if (currentGender === "Male") {
          proposedPeerMales.push({ compa_ratio: proposedCR });
        } else if (currentGender === "Female") {
          proposedPeerFemales.push({ compa_ratio: proposedCR });
        }
        
        if (proposedPeerMales.length > 0 && proposedPeerFemales.length > 0) {
          const proposedAvgMaleCR = (proposedPeerMales.reduce((sum: number, m: any) => sum + (m.compa_ratio || 0), 0) / proposedPeerMales.length) * 100;
          const proposedAvgFemaleCR = (proposedPeerFemales.reduce((sum: number, m: any) => sum + (m.compa_ratio || 0), 0) / proposedPeerFemales.length) * 100;
          const proposedPayGap = Math.abs(proposedAvgFemaleCR - proposedAvgMaleCR);
          
          if (Math.abs(proposedPayGap - peerPayGap) < 1) {
            genderText += " The gender pay gap remains the same with this offer.";
          } else {
            const proposedGapFavour = proposedAvgFemaleCR > proposedAvgMaleCR ? "female" : "male";
            genderText += ` The pay gap becomes ${Math.ceil(proposedPayGap)}% in favour of ${proposedGapFavour} staff.`;
          }
        }
      }
    }
    
    return genderText;
  };

  const calculateYearsWithOrganisation = (hireDate: string | null): string => {
    if (!hireDate) return "N/A";
    
    const start = new Date(hireDate);
    const today = new Date();
    
    const years = differenceInYears(today, start);
    const totalMonths = differenceInMonths(today, start);
    const months = totalMonths - (years * 12);
    
    if (months === 0) {
      return `${years} years`;
    }
    
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
    const peerGroup = calculatePeerGroupAnalysis();
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
    
    // Extract first name
    const firstName = selectedAnalysis.employee_name.split(' ')[0];

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
            text: `${pronoun === "he" ? "His" : pronoun === "she" ? "Her" : "Their"} current ${selectedAnalysis.contract_type === "consultancy" ? "fee" : "salary"} is ${Math.ceil(selectedAnalysis.current_salary).toLocaleString()} ${selectedAnalysis.currency}. ${pronoun === "he" ? "His" : pronoun === "she" ? "Her" : "Their"} current compa-ratio is ${Math.ceil(selectedAnalysis.compa_ratio_current)}% to the Level ${selectedAnalysis.level} in ${selectedAnalysis.country}.`,
            spacing: { after: 100 },
          }),
          new Paragraph({
            text: (() => {
              const cr = selectedAnalysis.compa_ratio_current;
              if (cr < 95) {
                return `${firstName} is at Foundation Level - ${pronoun} requires handholding/guidance to contribute effectively. Meliore typically manages such skills around the 90%CR-95%CR and will as a rule start at the 90%CR with flexibility for adjustment depending on the quantum, breadth and depth of prior relevant experience of the holder.`;
              } else if (cr >= 95 && cr < 105) {
                return `${firstName} is at Advanced Level - ${pronoun} does not require any handholding and needs minimum guidance to contribute effectively. Meliore typically manages such skills around the 95%CR-105%CR.`;
              } else {
                return `${firstName} is at Authority Level - ${pronoun} is a subject matter referent recognized in their field internally and externally and in relevant communities of practice and thought leaders. Meliore typically manages such skills around the 105%CR-120%CR.`;
              }
            })(),
            spacing: { after: 100 },
          }),
          new Paragraph({
            text: `Based on qualifications, skills and experience, P&C proposes to pay ${Math.ceil(selectedAnalysis.proposed_salary).toLocaleString()} ${selectedAnalysis.currency} per year which equals to a Compa-ratio of ${Math.ceil((selectedAnalysis.proposed_salary / midpoint) * 100)}%. This is within the budgeted ${selectedAnalysis.contract_type === "consultancy" ? "fee" : "salary"} for this role.`,
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
            text: `We currently have ${equityDistance.count} ${equityDistance.contractType} on a Meliore Level ${selectedAnalysis.level} in ${selectedAnalysis.country} including ${selectedAnalysis.employee_name}. The equity distance for the ${equityDistance.count} staff ${equityDistance.count === 1 ? 'member' : 'members'} is ${Math.ceil(equityDistance.current)}%. If we offer our proposition, the new equity distance ${Math.abs(equityDistance.current - equityDistance.proposed) < 0.01 ? 'remains the same' : `will be ${Math.ceil(equityDistance.proposed)}%`}.`,
            spacing: { after: 200 },
          }),
          new Paragraph({
            text: peerGroup.peerCount === 0 
              ? `From these ${equityDistance.count} ${equityDistance.contractType} on the level ${selectedAnalysis.level} in ${selectedAnalysis.country}, none have been identified as peers based on the Seniority/CR level.`
              : `From these ${equityDistance.count} ${equityDistance.contractType} on the level ${selectedAnalysis.level} in ${selectedAnalysis.country}, ${peerGroup.peerCount} have been identified as peers because of the Seniority/CR level. These ${peerGroup.peerCount} peers have an average CR of ${Math.ceil(peerGroup.averageCR)}%.`,
            spacing: { before: 200, after: 200 },
          }),

          // Cohort Analysis
          new Paragraph({
            children: [new TextRun({ text: "Cohort Reference Group", bold: true, size: 28 })],
            spacing: { before: 200, after: 100 },
          }),
          new Paragraph({
            text: cohortAnalysis.cohortCount === 1
              ? `From the other staff members on Meliore grading Level ${selectedAnalysis.level} in ${selectedAnalysis.country}, ${cohortAnalysis.cohortCount} of them are reporting to ${cohortAnalysis.supervisorName}.`
              : cohortAnalysis.cohortCount > 1
              ? `From the other staff members on Meliore grading Level ${selectedAnalysis.level} in ${selectedAnalysis.country}, ${cohortAnalysis.cohortCount} of them are reporting to ${cohortAnalysis.supervisorName}. The average Compa-ratio of these other staff reporting to ${cohortAnalysis.supervisorName} is ${Math.ceil(cohortAnalysis.averageCR)}%.`
              : `From the other staff members on Meliore grading Level ${selectedAnalysis.level} in ${selectedAnalysis.country}, none of them are reporting to ${cohortAnalysis.supervisorName}.`,
            spacing: { after: cohortAnalysis.cohortCount > 0 ? 100 : 200 },
          }),
          ...(cohortAnalysis.cohortCount > 0 ? [
            new Paragraph({
              text: "Here are the details:",
              spacing: { after: 100 },
            }),
            ...cohortAnalysis.cohortMembers.map((member: any) => 
              new Paragraph({
                text: `${member.employee_name} - ${member.contract_type === 'consultancy' ? 'Fee' : 'Salary'} = ${Math.ceil(member.current_salary || 0).toLocaleString()} ${member.currency} - CR = ${Math.ceil((member.compa_ratio || 0) * 100)}%`,
                spacing: { after: 100 },
              })
            ),
            new Paragraph({
              text: "",
              spacing: { after: 100 },
            })
          ] : []),

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
            text: `According to Trading Economics, The annual inflation rate in ${selectedAnalysis.country} is ${selectedAnalysis.inflation_rate || "N/A"}% in September ${currentYear}.`,
            spacing: { after: 100 },
          }),
          ...(fxCurrent && fxPrevious && fxChange && parseFloat(fxChange) !== 0 ? [
            new Paragraph({
              text: `On average during ${currentYear}, 1 USD allowed our staff members to obtain ${fxCurrent} ${selectedAnalysis.contract_type === "consultancy" ? feeApprovalData?.document_content?.employee?.currency || "KES" : selectedAnalysis.currency}.`,
              spacing: { after: 100 },
            }),
            new Paragraph({
              text: `On average during ${previousYear}, 1 USD allowed our staff members to obtain ${fxPrevious} ${selectedAnalysis.contract_type === "consultancy" ? feeApprovalData?.document_content?.employee?.currency || "KES" : selectedAnalysis.currency}.`,
              spacing: { after: 100 },
            }),
            new Paragraph({
              text: `In conclusion: on average, 1 USD allowed our staff members to obtain ${Math.ceil(Math.abs(parseFloat(fxChange || "0")))}% ${parseFloat(fxChange || "0") > 0 ? "more" : "less"} than the previous year.`,
              spacing: { after: 100 },
            })
          ] : []),
          ...(macroEffect ? [
            new Paragraph({
              text: `The effect of Macroeconomic elements on the purchasing power of staff members in ${selectedAnalysis.country} is a ${parseFloat(macroEffect) > 0 ? "decrease" : "increase"} of ${Math.ceil(Math.abs(parseFloat(macroEffect)))}%.`,
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
  const peerGroup = calculatePeerGroupAnalysis();
  const cohortAnalysis = calculateCohortAnalysis();
  const avgCompaRatio = calculateAverageCompaRatio();
  const midpoint = selectedAnalysis.kf_midpoint || selectedAnalysis.wtw_midpoint || 0;
  const dataSource = selectedAnalysis.kf_midpoint ? "Korn Ferry" : "Towers Watson";
  const dataYear = selectedAnalysis.kf_midpoint ? 2024 : 2025;
  
  // Get employment history from stored fee approval data
  const employeeData = feeApprovalData?.document_content?.employee;
  const rawData = employeeData?.raw_data as any;
  const gender = rawData?.Gender || rawData?.gender;
  const pronoun = gender?.toLowerCase() === "male" ? "he" : gender?.toLowerCase() === "female" ? "she" : "they";
  const hireDate = employeeData?.hire_date ? new Date(employeeData.hire_date) : null;
  const hireDateFormatted = hireDate ? hireDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : "N/A";
  const yearsWithOrg = hireDate ? calculateYearsWithOrganisation(employeeData.hire_date) : "N/A";
  const firstName = selectedAnalysis.employee_name.split(' ')[0];

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
                  Budgeted Amount
                </TableCell>
                <TableCell className="text-center">
                  <Check className="h-4 w-4 mx-auto" />
                </TableCell>
                <TableCell>
                  Budgeted {selectedAnalysis.contract_type === "consultancy" ? "fee" : "salary"} for this role of {feeApprovalData?.document_content?.budget_amount ? 
                    `${Math.ceil(parseFloat(feeApprovalData.document_content.budget_amount)).toLocaleString()} ${selectedAnalysis.currency}` : 
                    `${Math.ceil(selectedAnalysis.proposed_salary).toLocaleString()} ${selectedAnalysis.currency}`} per year.{selectedAnalysis.contract_type === "consultancy" ? " (6% increase from current fee)" : ""}
                </TableCell>
              </TableRow>

              <TableRow>
                <TableCell className="font-medium">
                  Compensation Philosophy & Proposed Salary
                </TableCell>
                <TableCell className="text-center">
                  <Check className="h-4 w-4 mx-auto" />
                </TableCell>
                <TableCell className="whitespace-pre-line">
                  Our philosophy is to manage pay around the midpoint of the pay band or the 75th percentile of the market data. The current 75th percentile for a Meliore Level {selectedAnalysis.level} in {selectedAnalysis.country} is {Math.ceil(midpoint).toLocaleString()} {selectedAnalysis.currency} (which is also 100% Compa-ratio).
                  {"\n\n"}
                  {selectedAnalysis.employee_name} has been with the organisation for {yearsWithOrg}, {pronoun} joined in {hireDateFormatted}.
                  {"\n\n"}
                  {pronoun === "he" ? "His" : pronoun === "she" ? "Her" : "Their"} current {selectedAnalysis.contract_type === "consultancy" ? "fee" : "salary"} is {Math.ceil(selectedAnalysis.current_salary).toLocaleString()} {selectedAnalysis.currency}. {pronoun === "he" ? "His" : pronoun === "she" ? "Her" : "Their"} current compa-ratio is {Math.ceil(selectedAnalysis.compa_ratio_current)}% to the Level {selectedAnalysis.level} in {selectedAnalysis.country}.
                  {"\n\n"}
                  {(() => {
                    const cr = selectedAnalysis.compa_ratio_current;
                    if (cr < 95) {
                      return `${firstName} is at Foundation Level - ${pronoun} requires handholding/guidance to contribute effectively. Meliore typically manages such skills around the 90%CR-95%CR and will as a rule start at the 90%CR with flexibility for adjustment depending on the quantum, breadth and depth of prior relevant experience of the holder.`;
                    } else if (cr >= 95 && cr < 105) {
                      return `${firstName} is at Advanced Level - ${pronoun} does not require any handholding and needs minimum guidance to contribute effectively. Meliore typically manages such skills around the 95%CR-105%CR.`;
                    } else {
                      return `${firstName} is at Authority Level - ${pronoun} is a subject matter referent recognized in their field internally and externally and in relevant communities of practice and thought leaders. Meliore typically manages such skills around the 105%CR-120%CR.`;
                    }
                  })()}
                  {"\n\n"}
                  Based on qualifications, skills and experience, P&C proposes to pay {Math.ceil(selectedAnalysis.proposed_salary).toLocaleString()} {selectedAnalysis.currency} per year which equals to a Compa-ratio of {Math.ceil((selectedAnalysis.proposed_salary / midpoint) * 100)}%. This is within the budgeted {selectedAnalysis.contract_type === "consultancy" ? "fee" : "salary"} for this role.
                  {selectedAnalysis.rationale && `\n\nRationale: ${selectedAnalysis.rationale}`}
                </TableCell>
              </TableRow>

              <TableRow>
                <TableCell className="font-medium">
                  Equity Distance Analysis
                </TableCell>
                <TableCell className="text-center">
                  <Check className="h-4 w-4 mx-auto" />
                </TableCell>
                <TableCell className="whitespace-pre-line">
                  We currently have {equityDistance.count} {equityDistance.contractType} on a Meliore Level {selectedAnalysis.level} in {selectedAnalysis.country} including {selectedAnalysis.employee_name}. The equity distance for the {equityDistance.count} staff {equityDistance.count === 1 ? 'member' : 'members'} is {Math.ceil(equityDistance.current)}%. If we offer our proposition, the new equity distance {Math.abs(equityDistance.current - equityDistance.proposed) < 0.01 ? 'remains the same' : `is ${Math.ceil(equityDistance.proposed)}%`}.
                  {"\n\n"}
                  {peerGroup.peerCount === 0 
                    ? `From these ${equityDistance.count} ${equityDistance.contractType} on the level ${selectedAnalysis.level} in ${selectedAnalysis.country}, none have been identified as peers based on the Seniority/CR level.`
                    : `From these ${equityDistance.count} ${equityDistance.contractType} on the level ${selectedAnalysis.level} in ${selectedAnalysis.country}, ${peerGroup.peerCount} have been identified as peers because of the Seniority/CR level. These ${peerGroup.peerCount} peers have an average CR of ${Math.ceil(peerGroup.averageCR)}%.`
                  }
                </TableCell>
              </TableRow>

              <TableRow>
                <TableCell className="font-medium">
                  Cohort Reference Group
                </TableCell>
                <TableCell className="text-center">
                  <Check className="h-4 w-4 mx-auto" />
                </TableCell>
                <TableCell className="whitespace-pre-line">
                  {cohortAnalysis.cohortCount === 1
                    ? `From the other staff members on Meliore grading Level ${selectedAnalysis.level} in ${selectedAnalysis.country}, ${cohortAnalysis.cohortCount} of them are reporting to ${cohortAnalysis.supervisorName}.`
                    : cohortAnalysis.cohortCount > 1
                    ? `From the other staff members on Meliore grading Level ${selectedAnalysis.level} in ${selectedAnalysis.country}, ${cohortAnalysis.cohortCount} of them are reporting to ${cohortAnalysis.supervisorName}. The average Compa-ratio of these other staff reporting to ${cohortAnalysis.supervisorName} is ${Math.ceil(cohortAnalysis.averageCR)}%.`
                    : `From the other staff members on Meliore grading Level ${selectedAnalysis.level} in ${selectedAnalysis.country}, none of them are reporting to ${cohortAnalysis.supervisorName}.`}
                  {cohortAnalysis.cohortCount > 0 && (
                    <>
                      {"\n\n"}Here are the details:{"\n"}
                      {cohortAnalysis.cohortMembers.map((member: any, idx: number) => (
                        `${member.employee_name} - ${member.contract_type === 'consultancy' ? 'Fee' : 'Salary'} = ${Math.ceil(member.current_salary || 0).toLocaleString()} ${member.currency} - CR = ${Math.ceil((member.compa_ratio || 0) * 100)}%${idx < cohortAnalysis.cohortMembers.length - 1 ? '\n' : ''}`
                      )).join('')}
                    </>
                  )}
                </TableCell>
              </TableRow>

              <TableRow>
                <TableCell className="font-medium">
                  Average Compa-Ratio
                </TableCell>
                <TableCell className="text-center">
                  <Check className="h-4 w-4 mx-auto" />
                </TableCell>
                <TableCell>
                  The average Compa-Ratio for all staff on a Meliore Grading level {selectedAnalysis.level} in {selectedAnalysis.country} is {Math.ceil(avgCompaRatio.current)}%. The average Compa-Ratio becomes {Math.ceil(avgCompaRatio.proposed)}% with this proposition.
                </TableCell>
              </TableRow>

              <TableRow>
                <TableCell className="font-medium">
                  Gender Gap Analysis
                </TableCell>
                <TableCell className="text-center">
                  <Check className="h-4 w-4 mx-auto" />
                </TableCell>
                <TableCell className="whitespace-pre-line">
                  {getGenderGapAnalysis()}
                </TableCell>
              </TableRow>

              <TableRow>
                <TableCell className="font-medium">
                  Macroeconomic Analysis
                </TableCell>
                <TableCell className="text-center">
                  <Check className="h-4 w-4 mx-auto" />
                </TableCell>
                <TableCell className="space-y-2">
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
                      <>
                        <p>
                          According to Trading Economics, The annual inflation rate in {selectedAnalysis.country} is {inflationRate || "N/A"}% in September {currentYear}.
                        </p>
                        {fxCurrent && fxPrevious && fxChange && parseFloat(fxChange) !== 0 && (
                          <>
                            <p>
                              On average during {currentYear}, 1 USD allowed our staff members to obtain {fxCurrent} {selectedAnalysis.contract_type === "consultancy" ? feeApprovalData?.document_content?.employee?.currency || "KES" : selectedAnalysis.currency}.
                            </p>
                            <p>
                              On average during {previousYear}, 1 USD allowed our staff members to obtain {fxPrevious} {selectedAnalysis.contract_type === "consultancy" ? feeApprovalData?.document_content?.employee?.currency || "KES" : selectedAnalysis.currency}.
                            </p>
                            <p>
                              In conclusion: on average, 1 USD allowed our staff members to obtain {Math.ceil(Math.abs(parseFloat(fxChange || "0")))}% {parseFloat(fxChange || "0") > 0 ? "more" : "less"} than the previous year.
                            </p>
                          </>
                        )}
                        {macroEffect && (
                          <p>
                            The effect of Macroeconomic elements on the purchasing power of staff members in {selectedAnalysis.country} is a {parseFloat(macroEffect) > 0 ? "decrease" : "increase"} of {Math.ceil(Math.abs(parseFloat(macroEffect)))}%.
                          </p>
                        )}
                      </>
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
