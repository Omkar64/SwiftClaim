import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function extractStorageObjectPath(assetUrl: string, bucket: string): string | null {
  if (!assetUrl) return null;

  try {
    const parsed = new URL(assetUrl);
    const markers = [
      `/storage/v1/object/public/${bucket}/`,
      `/storage/v1/object/sign/${bucket}/`,
      `/storage/v1/object/authenticated/${bucket}/`,
    ];

    for (const marker of markers) {
      const idx = parsed.pathname.indexOf(marker);
      if (idx !== -1) return decodeURIComponent(parsed.pathname.slice(idx + marker.length));
    }

    return null;
  } catch {
    return assetUrl.startsWith("http") ? null : assetUrl.replace(/^\/+/, "");
  }
}

async function fetchImageAsBase64(
  url: string,
  admin: ReturnType<typeof createClient>,
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    let blob: Blob | null = null;

    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
      if (resp.ok) blob = await resp.blob();
      else console.warn(`Direct fetch failed for claim image (${resp.status}), trying storage download`);
    } catch (e) {
      console.warn("Direct fetch failed for claim image, trying storage download:", e);
    }

    if (!blob) {
      const objectPath = extractStorageObjectPath(url, "claim-images");
      if (objectPath) {
        const { data, error } = await admin.storage.from("claim-images").download(objectPath);
        if (error || !data) {
          console.warn(`Storage download failed for claim image ${objectPath}:`, error);
          return null;
        }
        blob = data;
      }
    }

    if (!blob) return null;
    const contentType = blob.type || "image/jpeg";
    if (!contentType.startsWith("image/")) return null;

    const buf = await blob.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
    return { base64: btoa(binary), mimeType: contentType.split(";")[0].trim() };
  } catch (e) {
    console.error("fetchImageAsBase64 error:", e);
    return null;
  }
}

const NVIDIA_FRAUD_MODEL = "nemotron-30b";
const GEMINI_FALLBACK_MODEL = "gemini-2.0-flash";
const RETRY_BACKOFF_MS = [3000, 6000, 12000];

function extractAIText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === "string") return part;
        if (typeof part === "object" && part !== null && "text" in part && typeof part.text === "string") {
          return part.text;
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

async function callFraudAI(
  messages: Array<{ role: string; content: unknown }>,
  tools: unknown[],
  toolChoice: unknown,
  nvidiaApiKey?: string | null,
  geminiApiKey?: string | null,
): Promise<Record<string, unknown> | null> {
  const providers = [
    nvidiaApiKey ? {
      url: "https://integrate.api.nvidia.com/v1/chat/completions",
      key: nvidiaApiKey,
      model: NVIDIA_FRAUD_MODEL,
      name: "NVIDIA",
    } : null,
    geminiApiKey ? {
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: geminiApiKey,
      model: GEMINI_FALLBACK_MODEL,
      name: "Gemini",
    } : null,
  ].filter(Boolean) as Array<{ url: string; key: string; model: string; name: string }>;

  for (const provider of providers) {
    for (let attempt = 0; attempt <= RETRY_BACKOFF_MS.length; attempt++) {
      if (attempt > 0) {
        const backoff = RETRY_BACKOFF_MS[attempt - 1] ?? RETRY_BACKOFF_MS[RETRY_BACKOFF_MS.length - 1];
        console.warn(`Retrying ${provider.name} fraud analysis (attempt ${attempt + 1}), waiting ${backoff}ms...`);
        await new Promise((resolve) => setTimeout(resolve, backoff));
      }

      try {
        const resp = await fetch(provider.url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${provider.key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: provider.model,
            messages,
            tools,
            tool_choice: toolChoice,
            temperature: 0.6,
            top_p: 0.95,
            max_tokens: 4096,
          }),
        });

        if (resp.ok) {
          const data = await resp.json();
          const toolArgs = data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
          if (toolArgs) return JSON.parse(toolArgs);

          const text = extractAIText(data.choices?.[0]?.message?.content);
          console.warn(`${provider.name} fraud analysis returned unstructured content: ${text.slice(0, 200)}`);
          break;
        }

        if (resp.status === 429 || resp.status === 402) {
          console.warn(`${provider.name} fraud AI rate limited (${resp.status}), attempt ${attempt + 1}/4`);
          if (attempt === RETRY_BACKOFF_MS.length) break;
          continue;
        }

        const errText = await resp.text().catch(() => "");
        console.error(`${provider.name} fraud AI error ${resp.status}: ${errText}`);
        if (attempt === RETRY_BACKOFF_MS.length) break;
      } catch (e) {
        console.error(`${provider.name} fraud analysis call failed on attempt ${attempt + 1}:`, e);
        if (attempt === RETRY_BACKOFF_MS.length) break;
      }
    }

    console.warn(`${provider.name} fraud analysis exhausted, trying next provider...`);
  }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const nvidiaApiKey = Deno.env.get("NVIDIA_API_KEY");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");

    // --- AuthN: require valid JWT ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.replace("Bearer ", "");
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const callerId = claimsData.claims.sub as string;

    const { claim_id } = await req.json();
    if (!claim_id || typeof claim_id !== "string") {
      return new Response(JSON.stringify({ error: "claim_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // --- AuthZ: caller must own this claim OR be admin ---
    const { data: roleRow } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId)
      .eq("role", "admin")
      .maybeSingle();
    const isAdmin = !!roleRow;

    if (!isAdmin) {
      const { data: ownerCheck } = await admin
        .from("claims")
        .select("user_id")
        .eq("id", claim_id)
        .maybeSingle();
      if (!ownerCheck || ownerCheck.user_id !== callerId) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: claim, error: fetchErr } = await admin
      .from("claims")
      .select("*")
      .eq("id", claim_id)
      .maybeSingle();

    if (fetchErr || !claim) {
      return new Response(JSON.stringify({ error: "Claim not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch all claim images
    const { data: claimImages } = await admin
      .from("claim_images")
      .select("*")
      .eq("claim_id", claim_id)
      .order("sort_order", { ascending: true });

    const allImages = (claimImages || []) as Array<{
      image_url: string; latitude: number | null; longitude: number | null;
      image_timestamp: string | null; label: string;
    }>;

    // Fall back to legacy single image
    const imageSources = allImages.length > 0 ? allImages : (claim.damage_image_url ? [{
      image_url: claim.damage_image_url as string,
      latitude: claim.image_latitude as number | null,
      longitude: claim.image_longitude as number | null,
      image_timestamp: claim.image_timestamp as string | null,
      label: "primary",
    }] : []);

    let fraudAnalysis = {
      risk_level: "LOW" as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
      confidence_score: 10,
      flags: [] as string[],
      reasoning: "No anomalies detected. Damage photos and description are consistent.",
      analyzed_at: new Date().toISOString(),
      ai_processed: false,
    };

    const hasApiKey = !!(nvidiaApiKey || geminiApiKey);
    if (hasApiKey && imageSources.length > 0) {
      const imageContentParts: unknown[] = [];
      const gpsDetails: string[] = [];

      for (const imgSrc of imageSources) {
        const fetched = await fetchImageAsBase64(imgSrc.image_url, admin);
        if (fetched) {
          imageContentParts.push({ type: "image_url", image_url: { url: `data:${fetched.mimeType};base64,${fetched.base64}` } });
          gpsDetails.push(`"${imgSrc.label}": GPS ${imgSrc.latitude ?? "N/A"}, ${imgSrc.longitude ?? "N/A"} | Time: ${imgSrc.image_timestamp ?? "N/A"}`);
        }
      }

      if (imageContentParts.length === 0) {
        console.warn("Fraud analysis AI skipped because claim images could not be read from storage.");
      }

      if (imageContentParts.length > 0) {
        const systemPrompt = `You are a fraud detection specialist for SwiftClaim, an insurance claims automation system. 
You will receive MULTIPLE damage photos from different angles. Cross-reference ALL photos with the claim description.
Evaluate:
- Do ALL photos show damage to the SAME vehicle?
- Are GPS locations across photos consistent (same incident site)?
- Does the damage match the described accident type and severity?
- Any signs of pre-existing damage, staging, or web-sourced images?
- Are timestamps consistent across photos?
Be objective and specific. Use tool calling to return structured output.`;

        const userPrompt = `Claim details:
- Claim Number: ${claim.claim_number}
- Vehicle: ${claim.vehicle_number}
- Incident Location: ${claim.location}
- Description: "${claim.description}"
- Policy: ${claim.policy_id}
- Total photos submitted: ${imageSources.length}
- GPS per photo:\n${gpsDetails.join("\n")}
- GPS Metadata Valid: ${claim.image_metadata_valid ?? "N/A"}

All ${imageContentParts.length} damage photos are attached. Analyze each for fraud indicators and cross-reference GPS locations.`;

        const toolDef = [
          {
            type: "function",
            function: {
              name: "submit_fraud_analysis",
              description: "Submit structured fraud risk assessment for this insurance claim.",
              parameters: {
                type: "object",
                properties: {
                  risk_level: {
                    type: "string",
                    enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
                    description: "Overall fraud risk level.",
                  },
                  confidence_score: {
                    type: "number",
                    description: "Fraud confidence score 0-100.",
                  },
                  flags: {
                    type: "array",
                    items: { type: "string" },
                    description: "Specific fraud indicators found.",
                  },
                  reasoning: {
                    type: "string",
                    description: "2-3 sentence summary of your overall fraud assessment.",
                  },
                },
                required: ["risk_level", "confidence_score", "flags", "reasoning"],
                additionalProperties: false,
              },
            },
          },
        ];
        const toolChoice = { type: "function", function: { name: "submit_fraud_analysis" } };

        const messages = [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              { type: "text", text: userPrompt },
              ...imageContentParts,
            ],
          },
        ];

        const parsed = await callFraudAI(messages, toolDef, toolChoice, nvidiaApiKey, geminiApiKey);
        if (parsed) {
          fraudAnalysis = {
            risk_level: typeof parsed.risk_level === "string" ? parsed.risk_level : "LOW",
            confidence_score: Math.max(0, Math.min(100, Number(parsed.confidence_score) || 10)),
            flags: Array.isArray(parsed.flags) ? parsed.flags.filter((flag): flag is string => typeof flag === "string") : [],
            reasoning: typeof parsed.reasoning === "string" ? parsed.reasoning : "",
            analyzed_at: new Date().toISOString(),
            ai_processed: true,
          };
        }
      }
    }

    // Store fraud_analysis in the claim as a JSONB field extension
    // We store it inside the existing `billing` adjacent field using a metadata pattern
    // Actually we'll store it as a top-level update alongside the claim
    await admin.from("claims").update({
      fraud_analysis: fraudAnalysis,
    } as any).eq("id", claim_id);

    return new Response(JSON.stringify({ success: true, fraud_analysis: fraudAnalysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("fraud-analysis error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
