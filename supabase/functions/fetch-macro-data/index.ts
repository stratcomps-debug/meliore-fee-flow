import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { currency, country, contractType } = await req.json();
    console.log(`Fetching macro data for ${country} (${currency}, ${contractType})`);
    
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;
    
    // Map countries to their local currencies
    const countryToCurrency: Record<string, string> = {
      "Luxembourg": "EUR",
      "France": "EUR",
      "Germany": "EUR",
      "Spain": "EUR",
      "Italy": "EUR",
      "Netherlands": "EUR",
      "Belgium": "EUR",
      "Austria": "EUR",
      "Portugal": "EUR",
      "Ireland": "EUR",
      "USA": "USD",
      "United States": "USD",
      "Canada": "CAD",
      "Australia": "AUD",
      "Brazil": "BRL",
      "India": "INR",
      "Indonesia": "IDR",
      "Philippines": "PHP",
      "South Korea": "KRW",
      "Mexico": "MXN",
      "Argentina": "ARS",
      "UK": "GBP",
      "United Kingdom": "GBP",
    };
    
    // For consultancy contracts, always use the local currency for FX calculations
    // even though they're paid in USD
    const fxCurrency = contractType === "consultancy" 
      ? (countryToCurrency[country] || currency)
      : currency;
    
    console.log(`Using FX currency: ${fxCurrency} (contract type: ${contractType})`);
    
    let result = {
      inflationRate: 0,
      fxRateCurrent: 1,
      fxRatePrevious: 1,
      fxChangePercent: 0,
    };

    // Fetch FX rates - for consultancy, always fetch even if currency is USD
    // because we need to track USD purchasing power in local currency
    if (fxCurrency !== "USD") {
      try {
        console.log(`Fetching FX rates for USD to ${fxCurrency}...`);
        
        // Get current year average
        const currentYearStart = `${currentYear}-01-01`;
        const currentYearEnd = `${currentYear}-12-31`;
        const currentUrl = `https://api.exchangerate.host/timeseries?start_date=${currentYearStart}&end_date=${currentYearEnd}&base=USD&symbols=${fxCurrency}`;
        
        // Get previous year average
        const previousYearStart = `${previousYear}-01-01`;
        const previousYearEnd = `${previousYear}-12-31`;
        const previousUrl = `https://api.exchangerate.host/timeseries?start_date=${previousYearStart}&end_date=${previousYearEnd}&base=USD&symbols=${fxCurrency}`;
        
        const [currentResponse, previousResponse] = await Promise.all([
          fetch(currentUrl),
          fetch(previousUrl)
        ]);
        
        const currentData = await currentResponse.json();
        const previousData = await previousResponse.json();
        
        console.log('FX API responses received');
        
        // Calculate average rates
        if (currentData.success && currentData.rates) {
          const currentRates = Object.values(currentData.rates).map((day: any) => day[fxCurrency]);
          result.fxRateCurrent = currentRates.reduce((a: number, b: number) => a + b, 0) / currentRates.length;
          console.log(`Current FX rate: ${result.fxRateCurrent}`);
        }
        
        if (previousData.success && previousData.rates) {
          const previousRates = Object.values(previousData.rates).map((day: any) => day[fxCurrency]);
          result.fxRatePrevious = previousRates.reduce((a: number, b: number) => a + b, 0) / previousRates.length;
          console.log(`Previous FX rate: ${result.fxRatePrevious}`);
        }
        
        if (result.fxRateCurrent > 0 && result.fxRatePrevious > 0) {
          result.fxChangePercent = ((result.fxRateCurrent - result.fxRatePrevious) / result.fxRatePrevious) * 100;
          console.log(`FX change: ${result.fxChangePercent}%`);
        }
      } catch (error) {
        console.error("Error fetching FX rates:", error);
      }
    }

    // Fetch inflation rate using World Bank API (free, no key required)
    try {
      console.log(`Fetching inflation rate for ${country}...`);
      
      // World Bank uses country codes (ISO 3166-1 alpha-3)
      const countryCodeMap: Record<string, string> = {
        "Luxembourg": "LUX",
        "France": "FRA",
        "USA": "USA",
        "United States": "USA",
        "Canada": "CAN",
        "Australia": "AUS",
        "Brazil": "BRA",
        "India": "IND",
        "Indonesia": "IDN",
        "Philippines": "PHL",
        "South Korea": "KOR",
        "Mexico": "MEX",
        "Argentina": "ARG",
        "Italy": "ITA",
        "Spain": "ESP",
        "Germany": "DEU",
        "UK": "GBR",
        "United Kingdom": "GBR",
      };
      
      const countryCode = countryCodeMap[country] || country.substring(0, 3).toUpperCase();
      const inflationUrl = `https://api.worldbank.org/v2/country/${countryCode}/indicator/FP.CPI.TOTL.ZG?format=json&date=${previousYear}:${currentYear}&per_page=10`;
      
      const inflationResponse = await fetch(inflationUrl);
      const inflationData = await inflationResponse.json();
      
      console.log('Inflation API response received');
      
      if (Array.isArray(inflationData) && inflationData.length > 1 && Array.isArray(inflationData[1])) {
        // Get the most recent data point
        const latestData = inflationData[1].find((item: any) => item.value !== null);
        if (latestData && latestData.value !== null) {
          result.inflationRate = latestData.value;
          console.log(`Inflation rate: ${result.inflationRate}%`);
        }
      }
    } catch (error) {
      console.error("Error fetching inflation rate:", error);
    }

    console.log('Final result:', result);

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    console.error('Edge function error:', errorMessage);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    );
  }
});
