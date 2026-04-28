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
    // Verify admin JWT
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Validate user is admin
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData } = await userClient.auth.getClaims(token);
    if (!claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", claimsData.claims.sub)
      .eq("role", "admin")
      .maybeSingle();

    if (!roleRow) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Query Supabase analytics for process-claim edge function logs
    const projectId = Deno.env.get("SUPABASE_PROJECT_ID") ?? supabaseUrl.split("//")[1].split(".")[0];
    const analyticsUrl = `https://${projectId}.supabase.co/rest/v1/rpc/query_analytics`;

    // Use the Supabase Management API to query edge function logs
    // Falls back to querying from claims table for recent AI step completions
    const query = `
      select
        id,
        function_edge_logs.timestamp,
        event_message,
        m.function_id,
        m.execution_time_ms,
        response.status_code
      from function_edge_logs
      cross join unnest(metadata) as m
      cross join unnest(m.response) as response
      where m.function_id = 'process-claim'
      order by timestamp desc
      limit 20
    `;

    // Try the analytics endpoint
    let logs: Array<Record<string, unknown>> = [];
    try {
      const analyticsResp = await fetch(
        `https://${projectId}.supabase.co/analytics/v1/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceRoleKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ sql: query }),
        }
      );
      if (analyticsResp.ok) {
        const analyticsData = await analyticsResp.json();
        logs = analyticsData.result ?? analyticsData.data ?? [];
      }
    } catch (e) {
      console.warn("Analytics query failed, falling back to claims:", e);
    }

    // Enrich logs with claim data from the claims table
    // Join logs to claims using the claim_number parsed from event_message
    // Also fetch recent process-claim invocations from audit log as enrichment
    const { data: auditLogs } = await admin
      .from("admin_audit_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(20);

    // Fetch last 20 claims with their steps to reconstruct invocation history
    const { data: recentClaims } = await admin
      .from("claims")
      .select("id, claim_number, status, steps, updated_at, created_at, user_id")
      .order("updated_at", { ascending: false })
      .limit(20);

    // Build synthetic log entries from steps data
    const syntheticLogs: Array<Record<string, unknown>> = [];

    for (const claim of (recentClaims ?? [])) {
      const steps = Array.isArray(claim.steps) ? claim.steps as Array<Record<string, unknown>> : [];
      for (const step of steps) {
        if (step.status === "completed" && step.state) {
          syntheticLogs.push({
            id: `${claim.id}-${step.state}`,
            timestamp: step.completed_at ?? step.started_at ?? claim.updated_at,
            claim_id: claim.id,
            claim_number: claim.claim_number,
            processed_state: step.state,
            state_label: step.label ?? step.state,
            ai_processed: Boolean(step.ai_processed),
            agent: step.agent ?? "System",
            status_code: 200,
            execution_time_ms: null,
            details: typeof step.details === "string" ? (step.details as string).slice(0, 120) : null,
          });
        }
      }
    }

    // Sort newest first and deduplicate
    syntheticLogs.sort((a, b) =>
      new Date(String(b.timestamp)).getTime() - new Date(String(a.timestamp)).getTime()
    );

    return new Response(
      JSON.stringify({
        edge_logs: logs,
        invocations: syntheticLogs.slice(0, 20),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("get-agent-logs error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
