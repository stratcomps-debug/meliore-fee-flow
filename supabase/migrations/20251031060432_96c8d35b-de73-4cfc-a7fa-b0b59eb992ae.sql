-- Fix security warnings by adding search_path to functions

-- Update get_currency_by_country function with search_path
CREATE OR REPLACE FUNCTION public.get_currency_by_country(country_name TEXT)
RETURNS TEXT 
LANGUAGE plpgsql 
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN CASE country_name
    -- Europe (EUR)
    WHEN 'Austria' THEN 'EUR'
    WHEN 'Belgium' THEN 'EUR'
    WHEN 'France' THEN 'EUR'
    WHEN 'Germany' THEN 'EUR'
    WHEN 'Ireland' THEN 'EUR'
    WHEN 'Italy' THEN 'EUR'
    WHEN 'Luxembourg' THEN 'EUR'
    WHEN 'Netherlands' THEN 'EUR'
    WHEN 'Portugal' THEN 'EUR'
    WHEN 'Spain' THEN 'EUR'
    -- Other European currencies
    WHEN 'UK' THEN 'GBP'
    WHEN 'Denmark' THEN 'DKK'
    WHEN 'Norway' THEN 'NOK'
    WHEN 'Poland' THEN 'PLN'
    WHEN 'Sweden' THEN 'SEK'
    WHEN 'Ukraine' THEN 'UAH'
    -- Americas
    WHEN 'USA' THEN 'USD'
    WHEN 'Canada' THEN 'CAD'
    WHEN 'Mexico' THEN 'MXN'
    WHEN 'Brazil' THEN 'BRL'
    WHEN 'Argentina' THEN 'ARS'
    WHEN 'Chile' THEN 'CLP'
    WHEN 'Costa Rica' THEN 'CRC'
    -- Asia Pacific
    WHEN 'Australia' THEN 'AUD'
    WHEN 'New Zealand' THEN 'NZD'
    WHEN 'Japan' THEN 'JPY'
    WHEN 'South Korea' THEN 'KRW'
    WHEN 'Hong Kong' THEN 'HKD'
    WHEN 'India' THEN 'INR'
    WHEN 'Indonesia' THEN 'IDR'
    WHEN 'Malaysia' THEN 'MYR'
    WHEN 'Philippines' THEN 'PHP'
    WHEN 'Thailand' THEN 'THB'
    WHEN 'Bangladesh' THEN 'BDT'
    WHEN 'Myanmar' THEN 'MMK'
    WHEN 'Georgia' THEN 'GEL'
    -- Africa
    WHEN 'South Africa' THEN 'ZAR'
    WHEN 'Egypt' THEN 'EGP'
    WHEN 'Kenya' THEN 'KES'
    WHEN 'Nigeria' THEN 'NGN'
    WHEN 'Ghana' THEN 'GHS'
    WHEN 'Senegal' THEN 'XOF'
    ELSE 'USD' -- Default to USD for unknown countries
  END;
END;
$$;

-- Update set_humanforce_currency function with search_path
CREATE OR REPLACE FUNCTION public.set_humanforce_currency()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.currency = get_currency_by_country(NEW.country);
  RETURN NEW;
END;
$$;

-- Update set_fca_currency function with search_path
CREATE OR REPLACE FUNCTION public.set_fca_currency()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If contract type is consultancy, always USD
  IF NEW.contract_type = 'consultancy' THEN
    NEW.currency = 'USD';
  -- Otherwise, use the currency from the country
  ELSE
    NEW.currency = get_currency_by_country(NEW.country);
  END IF;
  RETURN NEW;
END;
$$;