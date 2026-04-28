import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const url = new URL(req.url);
    const claimNumber = url.searchParams.get("claim_number");

    if (!claimNumber) {
      return new Response(JSON.stringify({ error: "claim_number is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: claim, error } = await admin
      .from("claims")
      .select("claim_number, status, garage, created_at, steps")
      .eq("claim_number", claimNumber)
      .maybeSingle();

    if (error || !claim) {
      return new Response(JSON.stringify({ error: "Claim not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Strip sensitive data from steps — only expose label, status, agent
    const safeSteps = Array.isArray(claim.steps)
      ? (claim.steps as Array<Record<string, unknown>>).map((s) => ({
          id: s.id,
          state: s.state,
          label: s.label,
          agent: s.agent,
          status: s.status,
          timestamp: s.timestamp,
        }))
      : [];

    const publicData = {
      claim_number: claim.claim_number,
      status: claim.status,
      garage: claim.garage,
      created_at: claim.created_at,
      steps: safeSteps,
    };

    return new Response(JSON.stringify(publicData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("get-public-claim error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
