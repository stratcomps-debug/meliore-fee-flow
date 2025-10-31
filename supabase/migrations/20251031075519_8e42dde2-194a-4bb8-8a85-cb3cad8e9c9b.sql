-- Add employment_condition column to humanforce_data table
ALTER TABLE humanforce_data 
ADD COLUMN employment_condition text;

-- Update existing records to extract employment_condition from raw_data
UPDATE humanforce_data 
SET employment_condition = raw_data->>'employment_condition'
WHERE raw_data->>'employment_condition' IS NOT NULL;