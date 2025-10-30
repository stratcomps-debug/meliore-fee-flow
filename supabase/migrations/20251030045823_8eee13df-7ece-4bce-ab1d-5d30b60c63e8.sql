-- Create table for pay band midpoints (Korn Ferry and Towers Watson data)
CREATE TABLE public.payband_midpoints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  country TEXT NOT NULL,
  level TEXT NOT NULL,
  job_family TEXT,
  kf_midpoint NUMERIC,
  wtw_midpoint NUMERIC,
  currency TEXT,
  effective_date DATE NOT NULL,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  uploaded_by UUID REFERENCES auth.users(id),
  notes TEXT
);

-- Create table for HumanForce employee data
CREATE TABLE public.humanforce_data (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  upload_batch_id UUID NOT NULL,
  employee_id TEXT,
  employee_name TEXT NOT NULL,
  country TEXT NOT NULL,
  level TEXT,
  job_title TEXT,
  current_salary NUMERIC,
  currency TEXT,
  hire_date DATE,
  performance_rating TEXT,
  compa_ratio NUMERIC,
  raw_data JSONB,
  uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  uploaded_by UUID REFERENCES auth.users(id)
);

-- Create table for FCA analyses
CREATE TABLE public.fca_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_name TEXT NOT NULL,
  country TEXT NOT NULL,
  level TEXT NOT NULL,
  current_salary NUMERIC,
  proposed_salary NUMERIC,
  currency TEXT,
  contract_type TEXT, -- 'employee' or 'consultancy'
  
  -- Market data
  kf_midpoint NUMERIC,
  wtw_midpoint NUMERIC,
  compa_ratio_current NUMERIC,
  compa_ratio_proposed NUMERIC,
  
  -- Economic factors
  inflation_rate NUMERIC,
  fx_rate NUMERIC,
  fx_year TEXT,
  
  -- Performance & experience
  performance_rating TEXT,
  years_experience NUMERIC,
  years_in_role NUMERIC,
  
  -- Analysis & decision
  rationale TEXT,
  recommendation TEXT,
  approved BOOLEAN DEFAULT false,
  approval_date DATE,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  
  -- Link to HumanForce record
  humanforce_record_id UUID REFERENCES public.humanforce_data(id)
);

-- Create table for fee approval documents
CREATE TABLE public.fee_approvals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fca_analysis_id UUID REFERENCES public.fca_analyses(id),
  
  -- Approval workflow
  status TEXT DEFAULT 'draft', -- draft, submitted, approved, rejected
  submitted_by TEXT,
  approved_by_arantxa BOOLEAN DEFAULT false,
  approved_by_brian BOOLEAN DEFAULT false,
  approved_by_casely BOOLEAN DEFAULT false,
  approved_by_tim BOOLEAN DEFAULT false,
  
  -- Document content
  document_content JSONB,
  
  -- Metadata
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.payband_midpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.humanforce_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fca_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fee_approvals ENABLE ROW LEVEL SECURITY;

-- RLS Policies for authenticated users (all data is internal/sensitive)
CREATE POLICY "Authenticated users can view payband midpoints"
  ON public.payband_midpoints FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert payband midpoints"
  ON public.payband_midpoints FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view humanforce data"
  ON public.humanforce_data FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert humanforce data"
  ON public.humanforce_data FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view fca analyses"
  ON public.fca_analyses FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert fca analyses"
  ON public.fca_analyses FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update fca analyses"
  ON public.fca_analyses FOR UPDATE
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can view fee approvals"
  ON public.fee_approvals FOR SELECT
  USING (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can insert fee approvals"
  ON public.fee_approvals FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Authenticated users can update fee approvals"
  ON public.fee_approvals FOR UPDATE
  USING (auth.uid() IS NOT NULL);

-- Create indexes for better query performance
CREATE INDEX idx_humanforce_employee_name ON public.humanforce_data(employee_name);
CREATE INDEX idx_humanforce_country ON public.humanforce_data(country);
CREATE INDEX idx_humanforce_batch ON public.humanforce_data(upload_batch_id);
CREATE INDEX idx_fca_employee_name ON public.fca_analyses(employee_name);
CREATE INDEX idx_fca_country ON public.fca_analyses(country);
CREATE INDEX idx_fca_created_at ON public.fca_analyses(created_at);
CREATE INDEX idx_payband_country_level ON public.payband_midpoints(country, level);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for automatic timestamp updates
CREATE TRIGGER update_fca_analyses_updated_at
  BEFORE UPDATE ON public.fca_analyses
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_fee_approvals_updated_at
  BEFORE UPDATE ON public.fee_approvals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();