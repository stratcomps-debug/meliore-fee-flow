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
    const { currency, country } = await req.json();
    
    const currentYear = new Date().getFullYear();
    const previousYear = currentYear - 1;
    
    let result = {
      inflationRate: 0,
      fxRateCurrent: 1,
      fxRatePrevious: 1,
      fxChangePercent: 0,
    };

    // Fetch FX rates (skip if USD)
    if (currency !== "USD") {
      const fxUrlCurrent = `https://www.exchangerates.org.uk/USD-${currency}-spot-exchange-rates-history-${currentYear}.html`;
      const fxUrlPrevious = `https://www.exchangerates.org.uk/USD-${currency}-spot-exchange-rates-history-${previousYear}.html`;
      
      try {
        const [currentResponse, previousResponse] = await Promise.all([
          fetch(fxUrlCurrent),
          fetch(fxUrlPrevious)
        ]);
        
        const currentHtml = await currentResponse.text();
        const previousHtml = await previousResponse.text();
        
        // Extract average rates from the HTML
        const currentMatch = currentHtml.match(/Average exchange rate in \d+:\s*([\d.]+)/);
        const previousMatch = previousHtml.match(/Average exchange rate in \d+:\s*([\d.]+)/);
        
        if (currentMatch && previousMatch) {
          result.fxRateCurrent = parseFloat(currentMatch[1]);
          result.fxRatePrevious = parseFloat(previousMatch[1]);
          result.fxChangePercent = ((result.fxRateCurrent - result.fxRatePrevious) / result.fxRatePrevious) * 100;
        }
      } catch (error) {
        console.error("Error fetching FX rates:", error);
      }
    }

    // Fetch inflation rate from Trading Economics
    try {
      const inflationUrl = `https://tradingeconomics.com/${country.toLowerCase()}/inflation-cpi`;
      const inflationResponse = await fetch(inflationUrl);
      const inflationHtml = await inflationResponse.text();
      
      // Try multiple patterns to extract the inflation rate
      let inflationMatch = inflationHtml.match(/Last\s*<\/td>\s*<td[^>]*>\s*([\d.]+)/i);
      if (!inflationMatch) {
        inflationMatch = inflationHtml.match(/"actual":\s*([\d.]+)/i);
      }
      if (!inflationMatch) {
        inflationMatch = inflationHtml.match(/inflation-cpi.*?(\d+\.?\d*)\s*percent/i);
      }
      
      if (inflationMatch) {
        result.inflationRate = parseFloat(inflationMatch[1]);
      }
    } catch (error) {
      console.error("Error fetching inflation rate:", error);
    }

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    );
  }
});
