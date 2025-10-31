-- Add analysis_type column to fca_analyses table
ALTER TABLE public.fca_analyses 
ADD COLUMN analysis_type text DEFAULT 'existing_staff_contract_renewal' CHECK (
  analysis_type IN (
    'external_candidate_initial',
    'existing_staff_contract_renewal',
    'existing_staff_internal_move',
    'existing_staff_promotion_pathway'
  )
);

-- Add comment to explain the column
COMMENT ON COLUMN public.fca_analyses.analysis_type IS 'Type of FCA analysis: external_candidate_initial, existing_staff_contract_renewal, existing_staff_internal_move, or existing_staff_promotion_pathway';