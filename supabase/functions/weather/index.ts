import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Initialize Supabase client outside the handler to reuse it across warm starts
const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
const supabase = createClient(supabaseUrl, supabaseKey)

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const url = new URL(req.url)
    const city = url.searchParams.get('city') || 'Mumbai'
    const openWeatherKey = Deno.env.get('OPENWEATHER_API_KEY')
    
    // Detect Edge Location
    const country = req.headers.get('x-vercel-ip-country') || 'Unknown'
    const region = req.headers.get('x-region') || 'Edge Node'
    const serverLocation = `${region} (${country})`

    const startTime = Date.now()
    
    // Fetch Weather
    const weatherRes = await fetch(
      `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${openWeatherKey}&units=metric`
    )
    const weatherData = await weatherRes.json()
    
    const internalResponseTime = Date.now() - startTime

    const result = {
      city: weatherData.name,
      temperature: weatherData.main.temp,
      description: weatherData.weather[0].description,
      humidity: weatherData.main.humidity,
      wind_speed: weatherData.wind.speed,
      response_time_ms: internalResponseTime,
      server_location: `Edge Node - ${serverLocation}`,
      request_type: "edge"
    }

    // Log to Supabase asynchronously (non-blocking)
    supabase.from('api_logs').insert({
      request_type: 'edge',
      city: result.city,
      response_time_ms: result.response_time_ms,
      server_location: result.server_location
    }).then(({ error }) => {
      if (error) console.error("Logging error:", error)
    })

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
