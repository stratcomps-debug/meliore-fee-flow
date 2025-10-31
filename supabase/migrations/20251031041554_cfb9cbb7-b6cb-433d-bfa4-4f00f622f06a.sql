-- Enable DELETE permission for authenticated users on fca_analyses table
CREATE POLICY "Authenticated users can delete fca analyses"
ON public.fca_analyses
FOR DELETE
TO authenticated
USING (auth.uid() IS NOT NULL);