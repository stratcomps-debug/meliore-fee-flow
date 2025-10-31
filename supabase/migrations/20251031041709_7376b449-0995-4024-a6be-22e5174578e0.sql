-- Update foreign key to cascade deletes
ALTER TABLE fee_approvals 
DROP CONSTRAINT fee_approvals_fca_analysis_id_fkey;

ALTER TABLE fee_approvals
ADD CONSTRAINT fee_approvals_fca_analysis_id_fkey 
FOREIGN KEY (fca_analysis_id) 
REFERENCES fca_analyses(id) 
ON DELETE CASCADE;