import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Upload, FileText, History, Database } from "lucide-react";
import { PaybandUpload } from "@/components/dashboard/PaybandUpload";
import { HumanForceUpload } from "@/components/dashboard/HumanForceUpload";
import { FCAAnalysisWorkflow } from "@/components/dashboard/FCAAnalysisWorkflow";
import { HistoricalData } from "@/components/dashboard/HistoricalData";

export default function Dashboard() {
  const navigate = useNavigate();
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        navigate("/");
      } else {
        setUser(session.user);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        navigate("/");
      } else {
        setUser(session.user);
      }
    });

    return () => subscription.unsubscribe();
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/");
  };

  if (!user) return null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-foreground">Meliore Fee Flow</h1>
          <Button variant="outline" onClick={handleLogout}>
            Logout
          </Button>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <Tabs defaultValue="analysis" className="w-full">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="analysis" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              New Analysis
            </TabsTrigger>
            <TabsTrigger value="humanforce" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Upload Data
            </TabsTrigger>
            <TabsTrigger value="payband" className="flex items-center gap-2">
              <Database className="h-4 w-4" />
              Pay Bands
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-2">
              <History className="h-4 w-4" />
              Historical Data
            </TabsTrigger>
          </TabsList>

          <TabsContent value="analysis" className="mt-6">
            <FCAAnalysisWorkflow />
          </TabsContent>

          <TabsContent value="humanforce" className="mt-6">
            <HumanForceUpload />
          </TabsContent>

          <TabsContent value="payband" className="mt-6">
            <PaybandUpload />
          </TabsContent>

          <TabsContent value="history" className="mt-6">
            <HistoricalData />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
