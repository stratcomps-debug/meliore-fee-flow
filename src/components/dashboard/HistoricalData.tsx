import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { Search } from "lucide-react";
import { format } from "date-fns";

export const HistoricalData = () => {
  const [analyses, setAnalyses] = useState<any[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAnalyses();
  }, []);

  const loadAnalyses = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("fca_analyses")
      .select("*")
      .order("created_at", { ascending: false });

    if (!error && data) {
      setAnalyses(data);
    }
    setLoading(false);
  };

  const filteredAnalyses = analyses.filter((analysis) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      analysis.employee_name?.toLowerCase().includes(searchLower) ||
      analysis.country?.toLowerCase().includes(searchLower) ||
      analysis.level?.toLowerCase().includes(searchLower) ||
      analysis.recommendation?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historical FCA Analyses</CardTitle>
        <CardDescription>Search and view all past fee analyses</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by name, country, level, recommendation..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Employee</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Level</TableHead>
                <TableHead>Current Salary</TableHead>
                <TableHead>Proposed Salary</TableHead>
                <TableHead>Change %</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">
                    Loading...
                  </TableCell>
                </TableRow>
              ) : filteredAnalyses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center">
                    No analyses found
                  </TableCell>
                </TableRow>
              ) : (
                filteredAnalyses.map((analysis) => {
                  const change = analysis.current_salary
                    ? (((analysis.proposed_salary - analysis.current_salary) / analysis.current_salary) * 100).toFixed(2)
                    : "N/A";

                  return (
                    <TableRow key={analysis.id}>
                      <TableCell>{format(new Date(analysis.created_at), "MMM dd, yyyy")}</TableCell>
                      <TableCell className="font-medium">{analysis.employee_name}</TableCell>
                      <TableCell>{analysis.country}</TableCell>
                      <TableCell>{analysis.level}</TableCell>
                      <TableCell>
                        {analysis.current_salary?.toLocaleString()} {analysis.currency}
                      </TableCell>
                      <TableCell>
                        {analysis.proposed_salary?.toLocaleString()} {analysis.currency}
                      </TableCell>
                      <TableCell className={parseFloat(change) > 0 ? "text-green-600" : "text-red-600"}>
                        {change}%
                      </TableCell>
                      <TableCell>{analysis.approved ? "Approved" : "Pending"}</TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
};
