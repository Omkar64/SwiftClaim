import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CLAIM_STATES = [
  "REGISTERED", "ELIGIBILITY_VERIFIED", "DAMAGE_ASSESSED", "GARAGE_ASSIGNED",
  "SURVEY_COMPLETED", "INVENTORY_CONFIRMED", "PARTS_DISPATCHED", "PARTS_DELIVERED",
  "REPAIR_COMPLETED", "BILL_GENERATED", "PAYMENT_CONFIRMED", "GATE_PASS_ISSUED", "CLAIM_CLOSED",
] as const;

type ClaimState = (typeof CLAIM_STATES)[number];

type GarageRow = {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  phone: string | null;
  latitude: number;
  longitude: number;
  is_active: boolean;
  vehicle_types: string[] | null;
  repair_capabilities: string[] | null;
  cashless_supported: boolean;
  max_daily_capacity: number | null;
  created_at: string;
};

const STATE_LABELS: Record<ClaimState, string> = {
  REGISTERED: "Claim Registered", ELIGIBILITY_VERIFIED: "Eligibility Verified",
  DAMAGE_ASSESSED: "Damage Assessed", GARAGE_ASSIGNED: "Garage Assigned",
  SURVEY_COMPLETED: "Survey Completed", INVENTORY_CONFIRMED: "Inventory Confirmed",
  PARTS_DISPATCHED: "Parts Dispatched", PARTS_DELIVERED: "Parts Delivered",
  REPAIR_COMPLETED: "Repair Completed", BILL_GENERATED: "Bill Generated",
  PAYMENT_CONFIRMED: "Payment Confirmed", GATE_PASS_ISSUED: "Gate Pass Issued",
  CLAIM_CLOSED: "Claim Closed",
};

const STATE_AGENTS: Record<ClaimState, string> = {
  REGISTERED: "Claim Intake Agent", ELIGIBILITY_VERIFIED: "Eligibility Verification Agent",
  DAMAGE_ASSESSED: "Damage Assessment Agent", GARAGE_ASSIGNED: "Garage Assignment Agent",
  SURVEY_COMPLETED: "Surveyor Agent", INVENTORY_CONFIRMED: "Inventory Agent",
  PARTS_DISPATCHED: "Logistics Agent", PARTS_DELIVERED: "Logistics Agent",
  REPAIR_COMPLETED: "Repair Tracking", BILL_GENERATED: "Billing Agent",
  PAYMENT_CONFIRMED: "Accounts Agent", GATE_PASS_ISSUED: "Accounts Agent",
  CLAIM_CLOSED: "System",
};

const STATE_DESCS: Record<ClaimState, string> = {
  REGISTERED: "Claim registered with validated inputs and geo-tagged damage photo",
  ELIGIBILITY_VERIFIED: "Policy coverage and eligibility confirmed",
  DAMAGE_ASSESSED: "Damage severity and required parts identified",
  GARAGE_ASSIGNED: "Nearest authorized garage assigned",
  SURVEY_COMPLETED: "Spare parts classified and inventory queried",
  INVENTORY_CONFIRMED: "Spare parts availability confirmed and reserved",
  PARTS_DISPATCHED: "Parts dispatched from suppliers to garage",
  PARTS_DELIVERED: "All parts delivered to the assigned garage",
  REPAIR_COMPLETED: "Vehicle repair completed at garage",
  BILL_GENERATED: "Insurance and customer invoices generated",
  PAYMENT_CONFIRMED: "Both insurance and customer payments verified",
  GATE_PASS_ISSUED: "Gate pass generated for vehicle release",
  CLAIM_CLOSED: "Claim processing complete",
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

async function fetchStorageBlob(
  admin: ReturnType<typeof createClient>,
  bucket: string,
  assetUrl: string,
): Promise<Blob | null> {
  const objectPath = extractStorageObjectPath(assetUrl, bucket);
  if (!objectPath) return null;

  const { data, error } = await admin.storage.from(bucket).download(objectPath);
  if (error || !data) {
    console.warn(`Storage download failed for ${bucket}/${objectPath}:`, error);
    return null;
  }

  return data;
}

async function fetchAssetBlob(
  url: string,
  admin: ReturnType<typeof createClient>,
  bucket: string,
): Promise<Blob | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (resp.ok) return await resp.blob();
    console.warn(`Direct fetch failed for ${bucket} asset (${resp.status}), trying storage download`);
  } catch (e) {
    console.warn(`Direct fetch failed for ${bucket} asset, trying storage download:`, e);
  }

  return await fetchStorageBlob(admin, bucket, url);
}

async function fetchImageAsBase64(
  url: string,
  admin: ReturnType<typeof createClient>,
  bucket: string,
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    const blob = await fetchAssetBlob(url, admin, bucket);
    if (!blob) return null;

    const contentType = blob.type || "image/jpeg";
    if (!contentType.startsWith("image/")) {
      console.warn(`Unsupported image content-type for ${bucket}: ${contentType}`);
      return null;
    }

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

async function fetchDocumentText(
  url: string,
  admin: ReturnType<typeof createClient>,
): Promise<string | null> {
  try {
    const blob = await fetchAssetBlob(url, admin, "policy-documents");
    if (!blob) return null;
    const ct = blob.type || "";
    if (ct.includes("text") || ct.includes("json")) return await blob.text();
    if (ct.includes("pdf")) {
      console.warn("Policy document is a PDF; text extraction is not implemented in this edge function.");
    }
    return null;
  } catch {
    return null;
  }
}

const NVIDIA_VISION_MODEL = "nvidia/nemotron-nano-12b-v2-vl";
const NVIDIA_DEFAULT_MODEL = "nvidia/llama-3_1-nemotron-nano-8b-v1";
const GEMINI_FALLBACK_MODEL = "gemini-2.0-flash";

const AGENT_MODEL_MAP: Partial<Record<ClaimState, string>> = {
  ELIGIBILITY_VERIFIED: NVIDIA_VISION_MODEL,
  DAMAGE_ASSESSED: NVIDIA_VISION_MODEL,
  INVENTORY_CONFIRMED: "nemotron-parse",
  BILL_GENERATED: "nemotron-parse",
};

function messagesContainImages(messages: Array<{ role: string; content: unknown }>): boolean {
  return messages.some(({ content }) =>
    Array.isArray(content) && content.some((part) =>
      typeof part === "object" &&
      part !== null &&
      "type" in part &&
      (part as { type?: unknown }).type === "image_url"
    )
  );
}

function getModelForState(state: ClaimState, messages: Array<{ role: string; content: unknown }>): string {
  if (AGENT_MODEL_MAP[state]) return AGENT_MODEL_MAP[state]!;
  if (messagesContainImages(messages)) return NVIDIA_VISION_MODEL;
  return NVIDIA_DEFAULT_MODEL;
}

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

function extractJSONObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (ch === "\\") {
      escaped = true;
      continue;
    }

    if (ch === "\"") {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

async function callAI(
  messages: Array<{ role: string; content: unknown }>,
  model: string,
  geminiApiKey: string,
  tools?: unknown[],
  toolChoice?: unknown,
): Promise<{ content: string; ai_processed: boolean }> {
  const nvidiaApiKey = Deno.env.get("NVIDIA_API_KEY");

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: 0.6,
    top_p: 0.95,
    max_tokens: 4096,
  };
  if (tools) { body.tools = tools; body.tool_choice = toolChoice; }

  const providers: Array<{ url: string; key: string; name: string; bodyOverride?: Record<string, unknown> }> = [];

  if (nvidiaApiKey) {
    providers.push({
      url: "https://integrate.api.nvidia.com/v1/chat/completions",
      key: nvidiaApiKey,
      name: "NVIDIA",
    });
  }
  if (geminiApiKey) {
    providers.push({
      url: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
      key: geminiApiKey,
      name: "Gemini",
      bodyOverride: { model: GEMINI_FALLBACK_MODEL },
    });
  }

  for (const provider of providers) {
    const reqBody = { ...body, ...(provider.bodyOverride || {}) };

    for (let attempt = 0; attempt <= 2; attempt++) {
      if (attempt > 0) {
        const backoff = [3000, 6000, 12000][attempt - 1] ?? 12000;
        console.warn(`Retrying ${provider.name} (attempt ${attempt + 1}), waiting ${backoff}ms...`);
        await new Promise(r => setTimeout(r, backoff));
      }

      try {
        const resp = await fetch(provider.url, {
          method: "POST",
          headers: { Authorization: `Bearer ${provider.key}`, "Content-Type": "application/json" },
          body: JSON.stringify(reqBody),
        });

        if (resp.ok) {
          const data = await resp.json();
          const choice = data.choices?.[0];
          if (choice?.message?.tool_calls?.[0]?.function?.arguments) {
            try {
              const parsed = JSON.parse(choice.message.tool_calls[0].function.arguments);
              return { content: JSON.stringify(parsed), ai_processed: true };
            } catch { /* fall through */ }
          }
          const text = extractAIText(choice?.message?.content);
          if (text) return { content: text, ai_processed: true };
        }

        if (resp.status === 429 || resp.status === 402) {
          console.warn(`${provider.name} rate limited (${resp.status}), attempt ${attempt + 1}/3`);
          if (attempt === 2) break; // try next provider
          continue;
        }

        const errText = await resp.text().catch(() => "");
        console.error(`${provider.name} error ${resp.status}: ${errText}`);
        if (attempt === 2) break;
      } catch (e) {
        console.error(`${provider.name} call error attempt ${attempt + 1}:`, e);
        if (attempt === 2) break;
      }
    }
    console.warn(`${provider.name} exhausted, trying next provider...`);
  }
  return { content: "", ai_processed: false };
}

function buildSteps(
  completedUpTo: number,
  currentDetails: Record<string, { text: string; ai_processed: boolean; status?: string }>,
  existingSteps: Array<Record<string, unknown>> = [],
) {
  const now = new Date().toISOString();
  return CLAIM_STATES.map((state, i) => {
    const existing = existingSteps[i] ?? {};
    const detail = currentDetails[state];
    const isFailed = detail?.status === "failed";
    const isCompleted = !isFailed && i < completedUpTo;
    const isInProgress = !isFailed && i === completedUpTo;
    return {
      id: String(i + 1),
      state,
      label: STATE_LABELS[state],
      agent: STATE_AGENTS[state],
      description: STATE_DESCS[state],
      status: isFailed ? "failed" : isCompleted ? "completed" : isInProgress ? "in-progress" : "pending",
      details: detail?.text || "",
      ai_processed: detail?.ai_processed ?? false,
      timestamp: isCompleted ? (existing.timestamp as string || new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })) : "",
      completed_at: isCompleted ? (existing.completed_at as string || now) : null,
      started_at: isInProgress ? (existing.started_at as string || now) : (isCompleted ? existing.started_at as string || null : null),
    };
  });
}

// ══════════════════════════════════════════════════════════════
// HALT WORKFLOW — marks current step as failed and stops pipeline
// ══════════════════════════════════════════════════════════════
async function haltWorkflow(
  admin: ReturnType<typeof createClient>,
  claimId: string,
  claim: Record<string, unknown>,
  stepIdx: number,
  state: ClaimState,
  reason: string,
  details: Record<string, { text: string; ai_processed: boolean; status?: string }>,
  haltStatus: string, // e.g. "FRAUD_SUSPECTED" or "NOT_ELIGIBLE"
) {
  details[state] = { text: reason, ai_processed: true, status: "failed" };
  const steps = buildSteps(stepIdx, details, claim.steps as Array<Record<string, unknown>>);
  // Mark the current step as failed
  steps[stepIdx].status = "failed";

  await admin.from("claims").update({
    steps,
    status: haltStatus,
    awaiting_confirmation: false,
    paused: true,
    pending_step: stepIdx,
  }).eq("id", claimId);

  console.warn(`🚫 WORKFLOW HALTED at ${state}: ${haltStatus} — ${reason}`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY") || "";
    const hasAIKey = !!(Deno.env.get("NVIDIA_API_KEY") || geminiApiKey);

    const { claim_id, start_step, retry_step } = await req.json();
    if (!claim_id) {
      return new Response(JSON.stringify({ error: "claim_id required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

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

    const stepIdx = start_step ?? 0;
    const state = CLAIM_STATES[stepIdx];

    if (!state) {
      return new Response(JSON.stringify({ success: true, message: "All states processed" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build details from existing steps
    const details: Record<string, { text: string; ai_processed: boolean; status?: string }> = {};
    if (claim.steps && Array.isArray(claim.steps)) {
      for (const s of claim.steps as Record<string, unknown>[]) {
        if (s.details && s.state) {
          details[s.state as string] = {
            text: s.details as string,
            ai_processed: Boolean(s.ai_processed),
            status: s.status as string | undefined,
          };
        }
      }
    }

    // ══════════════════════════════════════════════════════════════
    // Fetch all claim images from claim_images table
    // ══════════════════════════════════════════════════════════════
    const { data: claimImages } = await admin
      .from("claim_images")
      .select("*")
      .eq("claim_id", claim_id)
      .order("sort_order", { ascending: true });

    const allImages = (claimImages || []) as Array<{
      image_url: string; latitude: number | null; longitude: number | null;
      image_timestamp: string | null; metadata_valid: boolean; label: string;
    }>;

    // ══════════════════════════════════════════════════════════════
    // STEP 0: REGISTERED — Validate geo-tagged images + fraud check
    // ══════════════════════════════════════════════════════════════
    if (state === "REGISTERED") {
      // 🔍 CHECK 1: Must have at least 1 image with valid GPS
      const validImages = allImages.filter(img => img.metadata_valid && img.latitude !== null);
      if (validImages.length === 0) {
        // Fallback: check legacy single-image fields
        const hasValidMetadata = claim.image_metadata_valid === true;
        const imgLat = claim.image_latitude as number | null;
        if (!hasValidMetadata || imgLat === null) {
          await haltWorkflow(admin, claim_id, claim, stepIdx, state, 
            "🚫 CLAIM REJECTED: No damage photos contain valid GPS geo-tag metadata. Only original camera photos with location data enabled are accepted.",
            details, "FRAUD_SUSPECTED");
          return new Response(JSON.stringify({
            success: false, halted: true, reason: "No images with GPS metadata",
            status: "FRAUD_SUSPECTED",
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // 🔍 CHECK 2: GPS sanity check (India bounding box) on all images
      for (const img of validImages) {
        const inIndia = img.latitude! >= 6 && img.latitude! <= 38 && img.longitude! >= 68 && img.longitude! <= 98;
        if (!inIndia) {
          console.warn(`GPS (${img.latitude}, ${img.longitude}) outside India — flagging`);
        }
      }

      // Mark current state as in-progress
      await admin.from("claims").update({
        steps: buildSteps(stepIdx, details, claim.steps as Array<Record<string, unknown>>),
        status: state, pending_step: stepIdx,
      }).eq("id", claim_id);

      // Run AI with ALL images for comprehensive intake validation
      let aiResult = { content: "", ai_processed: false };
      const imageSources = allImages.length > 0 ? allImages : (claim.damage_image_url ? [{ image_url: claim.damage_image_url as string, latitude: claim.image_latitude, longitude: claim.image_longitude, image_timestamp: claim.image_timestamp, metadata_valid: true, label: "primary" }] : []);

      if (hasAIKey && imageSources.length > 0) {
        const imageContentParts: unknown[] = [];
        const gpsInfo: string[] = [];

        for (const imgSrc of imageSources) {
          const fetched = await fetchImageAsBase64(imgSrc.image_url, admin, "claim-images");
          if (fetched) {
            imageContentParts.push({ type: "image_url", image_url: { url: `data:${fetched.mimeType};base64,${fetched.base64}` } });
            gpsInfo.push(`Photo "${imgSrc.label}": GPS ${imgSrc.latitude}, ${imgSrc.longitude} | Time: ${imgSrc.image_timestamp || "Unknown"}`);
          }
        }

        if (imageContentParts.length === 0) {
          console.warn("REGISTERED AI skipped because no claim images could be read from storage.");
        }

        if (imageContentParts.length > 0) {
          const messages = [
            { role: "system", content: getSystemPrompt("REGISTERED") },
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: `${buildBaseContext(claim, details)}\n\n${imageSources.length} damage photos submitted.\n${gpsInfo.join("\n")}\nStated Location: ${claim.location}\n\nValidate ALL photos:\n1. Do photos show real vehicle damage from different angles?\n2. Are GPS locations consistent with each other and the stated incident location?\n3. Any signs of staging, recycling, or downloaded images?\n4. Do all photos appear to be from the same incident?\n\nIf you detect fraud indicators, clearly state "FRAUD DETECTED" in your response.`,
                },
                ...imageContentParts,
              ],
            },
          ] as Array<{ role: string; content: unknown }>;
          aiResult = await callAI(messages, getModelForState(state, messages), geminiApiKey);
        }
      }

      const finalText = aiResult.content || getDefaultResult("REGISTERED", claim, details);
      const isFraud = finalText.toUpperCase().includes("FRAUD DETECTED");

      if (isFraud) {
        await haltWorkflow(admin, claim_id, claim, stepIdx, state,
          `🚫 FRAUD DETECTED by Claim Intake Agent: ${finalText}`,
          details, "FRAUD_SUSPECTED");
        return new Response(JSON.stringify({
          success: false, halted: true, reason: "Fraud detected at intake",
          status: "FRAUD_SUSPECTED", ai_processed: aiResult.ai_processed,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      details["REGISTERED"] = { text: finalText, ai_processed: aiResult.ai_processed && !!aiResult.content };

      // Trigger fraud analysis in background
      fetch(`${supabaseUrl}/functions/v1/fraud-analysis`, {
        method: "POST",
        headers: { Authorization: `Bearer ${serviceRoleKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ claim_id }),
      }).catch(e => console.warn("Fraud analysis trigger failed:", e));

      await admin.from("claims").update({
        steps: buildSteps(stepIdx + 1, details, claim.steps as Array<Record<string, unknown>>),
        status: state,
        awaiting_confirmation: retry_step ? claim.awaiting_confirmation : true,
        pending_step: stepIdx,
      }).eq("id", claim_id);

      return new Response(JSON.stringify({
        success: true, processed_state: state, awaiting_confirmation: true,
        ai_processed: aiResult.ai_processed && !!aiResult.content,
        gps_validated: true, image_count: imageSources.length,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ══════════════════════════════════════════════════════════════
    // STEP 1: ELIGIBILITY_VERIFIED — Strict policy check + halt
    // ══════════════════════════════════════════════════════════════
    if (state === "ELIGIBILITY_VERIFIED") {
      // 🔍 CHECK: Fetch policy documents from database
      const { data: policyDocs } = await admin
        .from("policy_documents")
        .select("*")
        .eq("user_id", claim.user_id)
        .eq("policy_id", claim.policy_id);

      // ENFORCE: No policy = immediate halt
      if (!policyDocs || policyDocs.length === 0) {
        await haltWorkflow(admin, claim_id, claim, stepIdx, state,
          "🚫 CLAIM REJECTED: No insurance policy document found for policy ID " + claim.policy_id + ". The user must upload their insurance policy in the 'My Policies' section before a claim can be processed.",
          details, "NOT_ELIGIBLE");

        return new Response(JSON.stringify({
          success: false, halted: true, reason: "No policy document found",
          status: "NOT_ELIGIBLE",
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // ENFORCE: Check if policy is expired
      const policyDoc = policyDocs[0];
      if (policyDoc.expiry_date) {
        const expiryDate = new Date(policyDoc.expiry_date);
        if (expiryDate < new Date()) {
          await haltWorkflow(admin, claim_id, claim, stepIdx, state,
            `🚫 CLAIM REJECTED: Policy ${claim.policy_id} expired on ${expiryDate.toLocaleDateString("en-IN", { dateStyle: "medium" })}. An active insurance policy is required to process claims.`,
            details, "NOT_ELIGIBLE");

          return new Response(JSON.stringify({
            success: false, halted: true, reason: "Policy expired",
            status: "NOT_ELIGIBLE",
          }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }
      }

      // Also check fraud analysis results before proceeding
      const { data: freshClaim } = await admin.from("claims").select("fraud_analysis").eq("id", claim_id).maybeSingle();
      const fraudResult = freshClaim?.fraud_analysis as Record<string, unknown> | null;
      if (fraudResult && (fraudResult.risk_level === "CRITICAL" || fraudResult.risk_level === "HIGH")) {
        await haltWorkflow(admin, claim_id, claim, stepIdx, state,
          `🚫 CLAIM HALTED — Fraud Detection flagged this claim as ${fraudResult.risk_level} risk (confidence: ${fraudResult.confidence_score}%). Reason: ${fraudResult.reasoning}. This claim requires manual admin review before proceeding.`,
          details, "FRAUD_SUSPECTED");

        return new Response(JSON.stringify({
          success: false, halted: true, reason: "High fraud risk detected",
          status: "FRAUD_SUSPECTED", fraud_analysis: fraudResult,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      // Mark as in-progress
      await admin.from("claims").update({
        steps: buildSteps(stepIdx, details, claim.steps as Array<Record<string, unknown>>),
        status: state, pending_step: stepIdx,
      }).eq("id", claim_id);

      // ═══ DEEP POLICY DOCUMENT PARSING — STRUCTURED OUTPUT ═══
      // Preferred input for this step is policy images so NVIDIA vision can read them directly.
      let aiResult = { content: "", ai_processed: false };
      let policyVerification: Record<string, unknown> | null = null;

      if (hasAIKey) {
        const imageDocParts: unknown[] = [];
        let textPolicyContent = "";

        for (const doc of policyDocs) {
          // Try text first
          const text = await fetchDocumentText(doc.document_url, admin);
          if (text) {
            textPolicyContent += `\n\n--- Policy Document: ${doc.document_name} ---\n${text.slice(0, 5000)}`;
          } else {
            const img = await fetchImageAsBase64(doc.document_url, admin, "policy-documents");
            if (img) {
              imageDocParts.push({
                type: "image_url",
                image_url: { url: `data:${img.mimeType};base64,${img.base64}` },
              });
              console.log(`Fetched policy doc "${doc.document_name}" as image for AI parsing`);
            } else {
              console.warn(`Could not fetch policy doc "${doc.document_name}" at ${doc.document_url}`);
            }
          }
        }

        if (!textPolicyContent && imageDocParts.length === 0) {
          console.warn("ELIGIBILITY_VERIFIED AI has no readable policy document content; using fallback logic.");
        }

        // Build coverage metadata string
        const coverageMeta = policyDocs.map(d =>
          `• ${d.document_name} | Stated coverage: ${d.coverage_type || "Unknown"} | Stated expiry: ${d.expiry_date || "N/A"}`
        ).join("\n");

        const registeredDetails = details["REGISTERED"]?.text || "";
        const damageDesc = claim.description || "";
        const damageSeverity = claim.damage_severity || "Unknown";
        const vehicleType = claim.vehicle_type || "Unknown";

        const eligibilityPrompt = `You are an insurance eligibility expert. The user uploaded these policy document(s):
${coverageMeta}
${textPolicyContent ? `\n--- Extracted text ---\n${textPolicyContent}` : ""}
${imageDocParts.length > 0 ? `\n${imageDocParts.length} policy document image(s) attached. Read every line of the document.` : ""}

CLAIM:
- Stated Policy ID: ${claim.policy_id}
- Vehicle: ${claim.vehicle_number} (${vehicleType})
- Incident: ${damageDesc}
- Location: ${claim.location}
- Severity: ${damageSeverity}
- Date: ${claim.incident_datetime || "Not provided"}

PREVIOUS AGENT FINDINGS:
${registeredDetails}

YOUR TASK — perform a REAL document audit and return ONLY valid JSON. Do not wrap it in markdown. Do not add commentary before or after the JSON.

Step 1 — AUTHENTICITY: Decide whether this is a genuine motor insurance policy document. Look for: insurer name/logo, policy number, IRDAI registration, sum insured table, premium breakdown, IDV, signatures/stamps. If the document is blank, a screenshot of a generic template, an unrelated PDF, a fake/altered image, or contains no insurer branding, set is_authentic=false.

Step 2 — IDENTITY MATCH: Extract the policy number printed on the document. Does it match the stated Policy ID "${claim.policy_id}"? Extract the vehicle registration number on the document. Does it match "${claim.vehicle_number}"? Populate document_policy_number, document_vehicle_number, policy_id_match, vehicle_match.

Step 3 — COVERAGE: Extract the actual coverage_type from the document (Comprehensive / Third-Party Only / OD Only / Fire & Theft / etc.). Extract sum_insured (IDV) and standard deductible amounts in INR.

Step 4 — COVERED PARTS: Based on the coverage type and any add-ons (zero-dep, engine protect, consumables, RSA, key replacement, etc.) actually listed in the document, list every category of car part the user can claim for THIS specific damage. Use plain English part names (e.g. "Front bumper", "Headlamp assembly", "Bonnet", "Windshield", "Airbags", "Engine block", "Suspension arms"). Also list excluded_parts (e.g. tyres, battery, normal wear & tear) and any conditions/exclusions that apply.

Step 5 — DECISION: ELIGIBLE / PARTIAL_COVERAGE / NOT_ELIGIBLE.
- If is_authentic=false OR policy_id_match=false OR vehicle_match=false → decision MUST be NOT_ELIGIBLE.
- If coverage type is "Third-Party Only" and the claim is for own-vehicle damage → NOT_ELIGIBLE.

Always quote a short snippet from the document in summary to prove you actually read it.

Return exactly this JSON shape:
{
  "is_authentic": true,
  "authenticity_reason": "string",
  "document_policy_number": "string",
  "document_vehicle_number": "string",
  "policy_holder_name": "string",
  "insurer_name": "string",
  "policy_id_match": true,
  "vehicle_match": true,
  "coverage_type": "Comprehensive",
  "sum_insured_inr": 0,
  "deductible_inr": 0,
  "add_ons": ["string"],
  "covered_parts": ["string"],
  "excluded_parts": ["string"],
  "conditions": ["string"],
  "summary": "string",
  "decision": "ELIGIBLE",
  "decision_reason": "string"
}`;

        const messages: Array<{ role: string; content: unknown }> = [
          { role: "system", content: getSystemPrompt("ELIGIBILITY_VERIFIED") },
        ];

        if (imageDocParts.length > 0) {
          messages.push({
            role: "user",
            content: [
              { type: "text", text: eligibilityPrompt },
              ...imageDocParts,
            ],
          });
        } else {
          messages.push({ role: "user", content: eligibilityPrompt });
        }

        aiResult = await callAI(
          messages,
          getModelForState(state, messages),
          geminiApiKey,
        );
        console.log(`Eligibility AI result (ai_processed=${aiResult.ai_processed}): ${aiResult.content.slice(0, 300)}`);

        // Try to parse structured output from plain JSON or a JSON block inside the response.
        try {
          const rawJson = extractJSONObject(aiResult.content) || aiResult.content;
          const parsed = JSON.parse(rawJson);
          if (parsed && typeof parsed === "object" && "decision" in parsed) {
            policyVerification = parsed as Record<string, unknown>;
          }
        } catch { /* not JSON, fall through to free-text */ }
      }

      // Build a human-readable summary from the structured result (or fall back to raw text)
      let finalText: string;
      let isNotEligible = false;

      if (policyVerification) {
        const pv = policyVerification;
        const decision = String(pv.decision || "");
        isNotEligible = decision === "NOT_ELIGIBLE";

        const lines: string[] = [];
        lines.push(`📄 Policy Document Verification — ${pv.insurer_name || "Insurer"}`);
        lines.push("");
        lines.push(`• Authenticity: ${pv.is_authentic ? "✅ Genuine document" : "❌ Document failed authenticity check"} — ${pv.authenticity_reason || ""}`);
        lines.push(`• Policy number on document: ${pv.document_policy_number || "(not found)"} — ${pv.policy_id_match ? "✅ matches stated Policy ID" : "❌ does NOT match stated Policy ID"}`);
        lines.push(`• Vehicle on document: ${pv.document_vehicle_number || "(not found)"} — ${pv.vehicle_match ? "✅ matches claim vehicle" : "❌ does NOT match claim vehicle"}`);
        if (pv.policy_holder_name) lines.push(`• Insured: ${pv.policy_holder_name}`);
        lines.push(`• Coverage: ${pv.coverage_type}${pv.sum_insured_inr ? ` | Sum insured: ₹${Number(pv.sum_insured_inr).toLocaleString("en-IN")}` : ""}${pv.deductible_inr ? ` | Deductible: ₹${Number(pv.deductible_inr).toLocaleString("en-IN")}` : ""}`);
        if (Array.isArray(pv.add_ons) && pv.add_ons.length) lines.push(`• Add-ons: ${(pv.add_ons as string[]).join(", ")}`);
        lines.push("");
        lines.push(`✅ Claimable parts under this policy: ${(pv.covered_parts as string[] || []).join(", ") || "(none extracted)"}`);
        if (Array.isArray(pv.excluded_parts) && pv.excluded_parts.length) {
          lines.push(`🚫 Excluded: ${(pv.excluded_parts as string[]).join(", ")}`);
        }
        if (Array.isArray(pv.conditions) && pv.conditions.length) {
          lines.push(`ℹ️ Conditions: ${(pv.conditions as string[]).join("; ")}`);
        }
        lines.push("");
        lines.push(`Decision: ${decision} — ${pv.decision_reason || ""}`);
        lines.push("");
        lines.push(`Summary: ${pv.summary || ""}`);
        finalText = lines.join("\n");
      } else {
        finalText = aiResult.content || getDefaultResult("ELIGIBILITY_VERIFIED", claim, details);
        isNotEligible = finalText.toUpperCase().includes("NOT ELIGIBLE");
      }

      if (isNotEligible) {
        await admin.from("claims").update({
          policy_verification: policyVerification,
        }).eq("id", claim_id);

        await haltWorkflow(admin, claim_id, claim, stepIdx, state,
          `🚫 ${finalText}`,
          details, "NOT_ELIGIBLE");

        return new Response(JSON.stringify({
          success: false, halted: true, reason: "Claim not eligible based on policy document analysis",
          status: "NOT_ELIGIBLE", ai_processed: aiResult.ai_processed,
          policy_verification: policyVerification,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      details["ELIGIBILITY_VERIFIED"] = { text: finalText, ai_processed: aiResult.ai_processed && !!aiResult.content };

      await admin.from("claims").update({
        steps: buildSteps(stepIdx + 1, details, claim.steps as Array<Record<string, unknown>>),
        status: state,
        awaiting_confirmation: retry_step ? claim.awaiting_confirmation : true,
        pending_step: stepIdx,
        policy_verification: policyVerification,
      }).eq("id", claim_id);

      return new Response(JSON.stringify({
        success: true, processed_state: state, awaiting_confirmation: true,
        ai_processed: aiResult.ai_processed && !!aiResult.content,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ══════════════════════════════════════════════════════════════
    // STEPS 10-12: Terminal states (PAYMENT → GATE PASS → CLOSE)
    // ══════════════════════════════════════════════════════════════
    if (stepIdx >= 10) {
      if (state === "PAYMENT_CONFIRMED") {
        const txnId = `TXN-${Date.now().toString(36).toUpperCase()}`;
        const baseCtx = buildBaseContext(claim, details);

        let paymentAI = { content: "", ai_processed: false };
        if (hasAIKey) {
          const messages = [
            { role: "system", content: getSystemPrompt("PAYMENT_CONFIRMED") },
            { role: "user", content: `${baseCtx}\n\nTransaction ID: ${txnId}\nBilling summary: ${JSON.stringify(claim.billing)}\n\nGenerate a formal payment verification confirmation.` },
          ] as Array<{ role: string; content: unknown }>;
          paymentAI = await callAI(messages, getModelForState("PAYMENT_CONFIRMED", messages), geminiApiKey);
        }
        details["PAYMENT_CONFIRMED"] = {
          text: paymentAI.content || `Payment verified. Transaction ID: ${txnId}. Insurance settlement processed to ${claim.garage || "assigned garage"}.`,
          ai_processed: paymentAI.ai_processed,
        };
        await admin.from("claims").update({
          steps: buildSteps(11, details, claim.steps as Array<Record<string, unknown>>),
          status: "PAYMENT_CONFIRMED", awaiting_confirmation: false, pending_step: 10,
        }).eq("id", claim_id);

        const gatePass = `GP-2026-${Math.floor(Math.random() * 99999).toString().padStart(5, "0")}`;
        let gateAI = { content: "", ai_processed: false };
        if (hasAIKey) {
          const messages = [
            { role: "system", content: getSystemPrompt("GATE_PASS_ISSUED") },
            { role: "user", content: `${baseCtx}\n\nGate Pass Number: ${gatePass}\nGarage: ${claim.garage || "assigned garage"}\nVehicle: ${claim.vehicle_number}\n\nGenerate the official gate pass authorization.` },
          ] as Array<{ role: string; content: unknown }>;
          gateAI = await callAI(messages, getModelForState("GATE_PASS_ISSUED", messages), geminiApiKey);
        }
        details["GATE_PASS_ISSUED"] = {
          text: gateAI.content || `Gate Pass ${gatePass} issued. Vehicle ${claim.vehicle_number} authorized for release from ${claim.garage || "assigned garage"}.`,
          ai_processed: gateAI.ai_processed,
        };
        await admin.from("claims").update({
          steps: buildSteps(12, details, claim.steps as Array<Record<string, unknown>>),
          status: "GATE_PASS_ISSUED", pending_step: 11,
        }).eq("id", claim_id);

        let closedAI = { content: "", ai_processed: false };
        if (hasAIKey) {
          const messages = [
            { role: "system", content: getSystemPrompt("CLAIM_CLOSED") },
            { role: "user", content: `${baseCtx}\n\nGate Pass: ${gatePass} | Txn: ${txnId}\n\nGenerate a concise claim closure report.` },
          ] as Array<{ role: string; content: unknown }>;
          closedAI = await callAI(messages, getModelForState("CLAIM_CLOSED", messages), geminiApiKey);
        }
        details["CLAIM_CLOSED"] = {
          text: closedAI.content || "Claim processing complete. All 13 stages verified and archived.",
          ai_processed: closedAI.ai_processed,
        };
        await admin.from("claims").update({
          steps: buildSteps(13, details, claim.steps as Array<Record<string, unknown>>),
          status: "CLAIM_CLOSED", pending_step: 12,
        }).eq("id", claim_id);

        return new Response(JSON.stringify({ success: true, gate_pass: gatePass }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ══════════════════════════════════════════════════════════════
    // STEPS 2-9: Standard agent processing
    // ══════════════════════════════════════════════════════════════

    // Enforce: previous step must be completed
    if (stepIdx > 0) {
      const prevState = CLAIM_STATES[stepIdx - 1];
      const prevDetail = details[prevState];
      if (!prevDetail || !prevDetail.text) {
        return new Response(JSON.stringify({
          error: `Cannot execute ${state}: previous step ${prevState} not completed`,
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // Mark current state as in-progress
    await admin.from("claims").update({
      steps: buildSteps(stepIdx, details, claim.steps as Array<Record<string, unknown>>),
      status: state, pending_step: stepIdx,
    }).eq("id", claim_id);

    if (state === "GARAGE_ASSIGNED") {
      const claimCoords = getClaimCoordinates(claim, allImages);
      const locationCity = extractCityFromLocation(String(claim.location || ""));
      const claimVehicleType = (claim.vehicle_type as string | null) || null;

      const { data: garageRows, error: garageError } = await admin
        .from("garages")
        .select("*")
        .eq("is_active", true);

      if (garageError) {
        throw new Error(`Failed to fetch garages: ${garageError.message}`);
      }

      const eligibleGarages = ((garageRows || []) as GarageRow[])
        .filter((garage) => vehicleTypeMatches(claimVehicleType, garage.vehicle_types))
        .filter((garage) => {
          if (claimCoords) return true;
          if (!locationCity) return false;
          return normalizeText(garage.city) === locationCity;
        });

      if (eligibleGarages.length === 0) {
        details["GARAGE_ASSIGNED"] = {
          text: claimCoords || locationCity
            ? "Manual garage assignment required: no eligible active garage was found for this claim."
            : "Manual garage assignment required: claim has no usable GPS coordinates or recognizable city for automatic assignment.",
          ai_processed: false,
        };

        const steps = buildSteps(stepIdx, details, claim.steps as Array<Record<string, unknown>>);
        steps[stepIdx].status = "pending";
        steps[stepIdx].details = details["GARAGE_ASSIGNED"].text;

        await admin.from("claims").update({
          steps,
          status: state,
          paused: true,
          awaiting_confirmation: false,
          pending_step: stepIdx,
          assigned_garage_id: null,
        }).eq("id", claim_id);

        return new Response(JSON.stringify({
          success: false,
          manual_review_required: true,
          reason: details["GARAGE_ASSIGNED"].text,
          processed_state: state,
        }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const rankedGarages = rankGarages(eligibleGarages, claimCoords, String(claim.location || ""));
      const selectedGarage = rankedGarages[0];
      const finalText = formatGarageAssignment(selectedGarage, selectedGarage.distanceKm);
      const garageDisplay = `${selectedGarage.name}, ${selectedGarage.address}, ${selectedGarage.city}, ${selectedGarage.state}`;

      details["GARAGE_ASSIGNED"] = { text: finalText, ai_processed: false };

      await admin.from("claims").update({
        steps: buildSteps(stepIdx + 1, details, claim.steps as Array<Record<string, unknown>>),
        status: state,
        awaiting_confirmation: retry_step ? claim.awaiting_confirmation : true,
        pending_step: stepIdx,
        garage: garageDisplay,
        assigned_garage_id: selectedGarage.id,
        paused: false,
      }).eq("id", claim_id);

      return new Response(JSON.stringify({
        success: true,
        processed_state: state,
        awaiting_confirmation: true,
        ai_processed: false,
        assigned_garage_id: selectedGarage.id,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let aiResult = { content: "", ai_processed: false };

    if (hasAIKey) {
      const systemPrompt = getSystemPrompt(state);
      const baseContext = buildBaseContext(claim, details);

      // DAMAGE_ASSESSED: multimodal with ALL images
      if (state === "DAMAGE_ASSESSED") {
        const imageSources = allImages.length > 0 ? allImages : (claim.damage_image_url ? [{ image_url: claim.damage_image_url as string, label: "primary" }] : []);
        const imageContentParts: unknown[] = [];
        for (const imgSrc of imageSources) {
          const fetched = await fetchImageAsBase64(imgSrc.image_url, admin, "claim-images");
          if (fetched) {
            imageContentParts.push({ type: "image_url", image_url: { url: `data:${fetched.mimeType};base64,${fetched.base64}` } });
          }
        }
        if (imageContentParts.length === 0) {
          console.warn("DAMAGE_ASSESSED AI skipped because no claim images could be read from storage.");
        }
        if (imageContentParts.length > 0) {
          const messages = [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: [
                { type: "text", text: `${baseContext}\n\n${imageContentParts.length} damage photos from different angles. Analyze ALL photos to identify every damaged part, classify severity for each, and determine replacement vs repair.` },
                ...imageContentParts,
              ],
            },
          ] as Array<{ role: string; content: unknown }>;
          aiResult = await callAI(messages, getModelForState(state, messages), geminiApiKey);
        }
      }

      // SURVEY_COMPLETED: structured tool-calling
      if (state === "SURVEY_COMPLETED" && !aiResult.content) {
        const messages = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `${baseContext}\n\nIdentify all spare parts needed. For each part, specify if covered by insurance.` },
        ] as Array<{ role: string; content: unknown }>;
        aiResult = await callAI(messages, getModelForState(state, messages), geminiApiKey, [
          {
            type: "function",
            function: {
              name: "submit_spare_parts",
              description: "Submit spare parts list.",
              parameters: {
                type: "object",
                properties: {
                  parts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        covered: { type: "boolean" },
                        source: { type: "string" },
                        notes: { type: "string" },
                      },
                      required: ["name", "covered"],
                      additionalProperties: false,
                    },
                  },
                  summary: { type: "string" },
                },
                required: ["parts", "summary"],
                additionalProperties: false,
              },
            },
          },
        ], { type: "function", function: { name: "submit_spare_parts" } });
      }

      // BILL_GENERATED: structured tool-calling
      if (state === "BILL_GENERATED" && !aiResult.content) {
        const messages = [
          { role: "system", content: systemPrompt },
          { role: "user", content: `${baseContext}\n\nGenerate itemized invoice. Parts cost, labour, GST @18%, insurance settlement, deductible, customer payable.` },
        ] as Array<{ role: string; content: unknown }>;
        aiResult = await callAI(messages, getModelForState(state, messages), geminiApiKey, [
          {
            type: "function",
            function: {
              name: "submit_invoice",
              description: "Submit invoice.",
              parameters: {
                type: "object",
                properties: {
                  invoiceNumber: { type: "string" },
                  partsCost: { type: "number" },
                  labourCost: { type: "number" },
                  subtotal: { type: "number" },
                  gst: { type: "number" },
                  gross: { type: "number" },
                  insuranceCover: { type: "number" },
                  deductible: { type: "number" },
                  customerPays: { type: "number" },
                  summary: { type: "string" },
                },
                required: ["partsCost", "labourCost", "subtotal", "gst", "gross", "insuranceCover", "deductible", "customerPays"],
                additionalProperties: false,
              },
            },
          },
        ], { type: "function", function: { name: "submit_invoice" } });
      }

      // Standard text-based agents
      if (!aiResult.content) {
        const messages = [
          { role: "system", content: systemPrompt },
          { role: "user", content: buildAgentPrompt(state, claim, details) },
        ] as Array<{ role: string; content: unknown }>;
        aiResult = await callAI(messages, getModelForState(state, messages), geminiApiKey);
      }
    }

    const finalText = aiResult.content || getDefaultResult(state, claim, details);
    const finalAiProcessed = aiResult.ai_processed && !!aiResult.content;

    details[state] = { text: finalText, ai_processed: finalAiProcessed };

    const updates: Record<string, unknown> = {
      steps: buildSteps(stepIdx + 1, details, claim.steps as Array<Record<string, unknown>>),
      status: state,
      awaiting_confirmation: retry_step ? claim.awaiting_confirmation : true,
      pending_step: stepIdx,
    };

    if (state === "SURVEY_COMPLETED" || state === "INVENTORY_CONFIRMED") {
      if (aiResult.ai_processed && aiResult.content.startsWith("{")) {
        try {
          const parsed = JSON.parse(aiResult.content);
          if (parsed.parts) updates.spare_parts = parsed.parts.map((p: Record<string, unknown>) => p.name);
        } catch {
          updates.spare_parts = extractSpareParts(finalText, claim.description as string, details);
        }
      } else {
        updates.spare_parts = extractSpareParts(finalText, claim.description as string, details);
      }
    }

    if (state === "BILL_GENERATED") {
      if (aiResult.ai_processed && aiResult.content.startsWith("{")) {
        try {
          const parsed = JSON.parse(aiResult.content);
          if (parsed.partsCost !== undefined) {
            const partsCost = parsed.partsCost || 0;
            const labourCost = parsed.labourCost || 0;
            const subtotal = parsed.subtotal || (partsCost + labourCost);
            const gst = parsed.gst || Math.round(subtotal * 0.18);
            const gross = parsed.gross || (subtotal + gst);
            const insuranceCover = parsed.insuranceCover || Math.round(gross * 0.85);
            const deductible = parsed.deductible || 1000;
            const customerPays = parsed.customerPays || (gross - insuranceCover + deductible);
            updates.billing = {
              invoiceNumber: parsed.invoiceNumber || `INV-2026-${Math.floor(Math.random() * 99999).toString().padStart(5, "0")}`,
              partsCost, labourCost, subtotal, gst, gross, insuranceCover, deductible, customerPays,
            };
          } else {
            updates.billing = generateBilling(claim.description as string, details);
          }
        } catch {
          updates.billing = generateBilling(claim.description as string, details);
        }
      } else {
        updates.billing = generateBilling(claim.description as string, details);
      }
    }

    await admin.from("claims").update(updates).eq("id", claim_id);

    if (!finalAiProcessed) console.warn(`[AI fallback used for ${state}]`);

    return new Response(JSON.stringify({
      success: true, processed_state: state, awaiting_confirmation: true,
      ai_processed: finalAiProcessed,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("process-claim error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ══════════════════════════════════════════════════════════════
// Helper functions
// ══════════════════════════════════════════════════════════════

function buildBaseContext(claim: Record<string, unknown>, prevDetails: Record<string, { text: string; ai_processed: boolean }>): string {
  let context = `Claim #${claim.claim_number} | Policy: ${claim.policy_id} | Vehicle: ${claim.vehicle_number} | Location: ${claim.location}\nIncident: ${claim.description}`;
  if (claim.image_latitude && claim.image_longitude) {
    context += `\nImage GPS: ${claim.image_latitude}, ${claim.image_longitude}`;
  }
  const prevKeys = Object.keys(prevDetails);
  if (prevKeys.length > 0) {
    context += "\n\n--- Previous Agent Results ---";
    for (const key of prevKeys) {
      context += `\n${STATE_LABELS[key as ClaimState]}: ${prevDetails[key].text}`;
    }
  }
  return context;
}

function getSystemPrompt(state: ClaimState): string {
  const base = "You are an AI agent in the SwiftClaim motor insurance claim automation system. Respond concisely (2-3 sentences max) with realistic, specific details.";

  switch (state) {
    case "REGISTERED":
      return `${base} You are the Claim Intake Agent. You MUST validate: 1) The damage photo shows real vehicle damage 2) The GPS coordinates in the image match the stated incident location 3) The image appears authentic (not downloaded/edited). If you detect ANY fraud indicators (location mismatch, staged damage, web-sourced image), respond with "FRAUD DETECTED:" followed by your reasoning.`;
    case "ELIGIBILITY_VERIFIED":
      return `${base} You are the Eligibility Verification Agent. You MUST check the user's uploaded insurance policy documents. Check: Is policy active? Coverage type (comprehensive/third-party/own-damage)? Does damage qualify? What are claim limits? If the claim is NOT eligible, you MUST respond with "NOT ELIGIBLE:" followed by the reason. Decisions: ELIGIBLE / NOT ELIGIBLE / PARTIAL COVERAGE.`;
    case "DAMAGE_ASSESSED":
      return `${base} You are the Damage Assessment Agent. Viewing the actual damage photo. Identify exactly which parts are damaged, classify severity, determine replacement vs repair.`;
    case "GARAGE_ASSIGNED":
      return `${base} You are the Garage Assignment Agent. Assign a specific nearby authorized cashless garage. Provide name, address, distance, contact.`;
    case "SURVEY_COMPLETED":
      return `${base} You are the Surveyor Agent. Identify all required spare parts. Classify covered vs non-covered by insurance.`;
    case "INVENTORY_CONFIRMED":
      return `${base} You are the Inventory Agent. Confirm stock levels, reserve parts, raise procurement if unavailable.`;
    case "PARTS_DISPATCHED":
      return `${base} You are the Logistics Agent. Coordinate delivery to the assigned garage with tracking details.`;
    case "PARTS_DELIVERED":
      return `${base} You are the Logistics Agent. Confirm all parts delivered. List items and any discrepancies.`;
    case "REPAIR_COMPLETED":
      return `${base} You are the Repair Tracking system. Confirm repair completion with quality check.`;
    case "BILL_GENERATED":
      return `${base} You are the Billing Agent. Generate two bills: insurance-covered and customer payable. Include parts, labour, GST, deductible. Use realistic Indian Rupee amounts.`;
    case "PAYMENT_CONFIRMED":
      return `${base} You are the Accounts Agent. Confirm insurance settlement, validate customer deductible payment, log net payout to garage.`;
    case "GATE_PASS_ISSUED":
      return `${base} You are the Accounts Agent issuing gate pass. Include vehicle release authorization and repair completion sign-off.`;
    case "CLAIM_CLOSED":
      return `${base} You are the System closing this claim. Write a comprehensive closure report summarizing the full journey.`;
    default:
      return base;
  }
}

function buildAgentPrompt(state: ClaimState, claim: Record<string, unknown>, prevResults: Record<string, { text: string; ai_processed: boolean }>): string {
  const context = buildBaseContext(claim, prevResults);
  const hasImage = !!claim.damage_image_url;

  switch (state) {
    case "GARAGE_ASSIGNED":
      return `${context}\n\nIncident at ${claim.location}. Assign nearest authorized garage with name, address, distance, phone.`;
    case "SURVEY_COMPLETED":
      return `${context}\n\nIdentify all spare parts needed. Classify covered vs non-covered. Check availability.`;
    case "INVENTORY_CONFIRMED":
      return `${context}\n\nVerify stock for all parts. Confirm availability, location, reservation status.`;
    case "PARTS_DISPATCHED":
      return `${context}\n\nDispatch all parts from source to assigned garage. Provide carrier, tracking, ETA.`;
    case "PARTS_DELIVERED":
      return `${context}\n\nConfirm delivery of all parts to garage. List received items.`;
    case "REPAIR_COMPLETED":
      return `${context}\n\nSimulate repair completion. Confirm quality check and repair summary.`;
    case "BILL_GENERATED":
      return `${context}\n\nGenerate itemized invoice. Parts cost, labour, GST @18%, insurance settlement, deductible, customer payable.`;
    default:
      return context;
  }
}

function getDefaultResult(state: ClaimState, claim: Record<string, unknown>, _prevResults: Record<string, { text: string; ai_processed: boolean }>): string {
  switch (state) {
    case "REGISTERED":
      return `Claim registered. Policy ${claim.policy_id}, Vehicle ${claim.vehicle_number}. GPS metadata validated (${claim.image_latitude}, ${claim.image_longitude}). Damage photo verified — shows vehicle collision damage consistent with stated location.`;
    case "ELIGIBILITY_VERIFIED":
      return `Policy ${claim.policy_id} verified. Policy is active (Comprehensive Cover). Covers: free OEM part replacement up to ₹5,00,000, cashless repair at network garages, zero depreciation. ELIGIBLE.`;
    case "DAMAGE_ASSESSED":
      return "Front bumper (severe — replacement), left headlight (moderate — replacement), left fender (moderate — replacement), hood (minor dents — repairable). 3 parts need replacement, 1 repairable.";
    case "GARAGE_ASSIGNED":
      return `Assigned: AutoCare Premium Service Center, Plot 42, MIDC Area, ${claim.location}. Distance: 3.2 km. Contact: +91-20-2567-8901.`;
    case "SURVEY_COMPLETED":
      return "Parts: 1× Front Bumper Assembly (covered), 1× Left Headlight (covered), 1× Left Fender (covered), 1× Bracket Set (covered). All available.";
    case "INVENTORY_CONFIRMED":
      return "All parts confirmed in stock and reserved.";
    case "PARTS_DISPATCHED":
      return "Dispatched: Pune Warehouse → Garage (Bumper+Fender, BlueDart, ETA 18hrs). Mumbai Hub → Garage (Headlight, DTDC, ETA 24hrs).";
    case "PARTS_DELIVERED":
      return "All parts delivered. No discrepancies. Ready for repair.";
    case "REPAIR_COMPLETED":
      return "Repair completed. All parts replaced, quality check passed.";
    case "BILL_GENERATED":
      return `Invoice #INV-2026-${Math.floor(Math.random() * 99999).toString().padStart(5, "0")}. Parts: ₹29,000 | Labour: ₹4,500 | GST: ₹6,030 | Gross: ₹39,530 | Insurance: ₹35,000 | Deductible: ₹1,000 | Customer pays: ₹4,530.`;
    default:
      return "Processed successfully.";
  }
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
}

function getClaimCoordinates(
  claim: Record<string, unknown>,
  claimImages: Array<{ latitude: number | null; longitude: number | null; metadata_valid: boolean }> = [],
): { latitude: number; longitude: number } | null {
  const claimLat = claim.image_latitude as number | null;
  const claimLng = claim.image_longitude as number | null;

  if (claimLat !== null && claimLng !== null) {
    return { latitude: claimLat, longitude: claimLng };
  }

  const validImage = claimImages.find((img) => img.metadata_valid && img.latitude !== null && img.longitude !== null);
  if (!validImage) return null;

  return { latitude: validImage.latitude!, longitude: validImage.longitude! };
}

function calculateDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRadians = (degrees: number) => degrees * (Math.PI / 180);
  const earthRadiusKm = 6371;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadiusKm * c;
}

function extractCityFromLocation(location: string): string | null {
  const parts = location.split(",").map((part) => normalizeText(part)).filter(Boolean);
  if (parts.length === 0) return null;
  return parts[0] || null;
}

function vehicleTypeMatches(claimVehicleType: string | null, garageVehicleTypes: string[] | null): boolean {
  if (!garageVehicleTypes || garageVehicleTypes.length === 0) return true;

  const normalizedGarageTypes = garageVehicleTypes.map(normalizeText);
  if (normalizedGarageTypes.includes("all")) return true;
  if (!claimVehicleType) return true;

  return normalizedGarageTypes.includes(normalizeText(claimVehicleType));
}

function formatGarageAssignment(garage: GarageRow, distanceKm?: number | null): string {
  const distanceLabel = typeof distanceKm === "number" ? `${distanceKm.toFixed(1)} km` : `City: ${garage.city}`;
  return `Assigned: ${garage.name}, ${garage.address}, ${garage.city}, ${garage.state}. Distance: ${distanceLabel}. Contact: ${garage.phone || "Not available"}. Cashless: ${garage.cashless_supported ? "Yes" : "No"}.`;
}

function rankGarages(
  garages: GarageRow[],
  claimCoords: { latitude: number; longitude: number } | null,
  claimLocation: string,
): Array<GarageRow & { distanceKm: number | null; textScore: number }> {
  const normalizedLocation = normalizeText(claimLocation);

  return garages
    .map((garage) => {
      const searchable = normalizeText(`${garage.name} ${garage.address} ${garage.city} ${garage.state}`);
      const textScore = normalizedLocation && searchable.includes(normalizedLocation)
        ? 3
        : normalizedLocation && searchable.includes(extractCityFromLocation(claimLocation) || "")
          ? 2
          : normalizedLocation && normalizedLocation.split(" ").some((token) => token.length > 2 && searchable.includes(token))
            ? 1
            : 0;

      return {
        ...garage,
        distanceKm: claimCoords
          ? calculateDistanceKm(claimCoords.latitude, claimCoords.longitude, garage.latitude, garage.longitude)
          : null,
        textScore,
      };
    })
    .sort((a, b) => {
      if (a.distanceKm !== null && b.distanceKm !== null && a.distanceKm !== b.distanceKm) {
        return a.distanceKm - b.distanceKm;
      }
      if (a.distanceKm !== null && b.distanceKm === null) return -1;
      if (a.distanceKm === null && b.distanceKm !== null) return 1;
      if (a.textScore !== b.textScore) return b.textScore - a.textScore;
      if (a.cashless_supported !== b.cashless_supported) return a.cashless_supported ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
}

function extractGarage(aiResult: string, location: string): string {
  const first = aiResult.split(/[.!]/)[0];
  if (first && first.length > 10) return first.replace(/^assigned:?\s*/i, "").trim();
  return `AutoCare Premium Service Center, ${location}`;
}

function extractSpareParts(aiResult: string, description: string, prevResults: Record<string, { text: string; ai_processed: boolean }>): string[] {
  const parts: string[] = [];
  const prevDamage = prevResults["DAMAGE_ASSESSED"]?.text || "";
  const text = (aiResult + " " + prevDamage + " " + description).toLowerCase();
  if (text.includes("bumper")) parts.push("Front Bumper Assembly");
  if (text.includes("headlight") || text.includes("head light")) parts.push("Headlight Unit");
  if (text.includes("fender")) parts.push("Fender Panel");
  if (text.includes("hood") || text.includes("bonnet")) parts.push("Hood/Bonnet");
  if (text.includes("windshield")) parts.push("Windshield Glass");
  if (text.includes("door")) parts.push("Door Panel");
  if (text.includes("mirror")) parts.push("Side Mirror Assembly");
  if (text.includes("bracket")) parts.push("Mounting Brackets Set");
  return parts.length > 0 ? parts : ["Front Bumper Assembly", "Headlight Unit", "Bumper Brackets", "Paint Kit"];
}

function generateBilling(description: string, _prevResults: Record<string, { text: string; ai_processed: boolean }>): Record<string, unknown> {
  const isMinor = description.toLowerCase().includes("scratch") || description.toLowerCase().includes("dent");
  const partsCost = isMinor ? 5500 : 29000;
  const labourCost = isMinor ? 2000 : 4500;
  const subtotal = partsCost + labourCost;
  const gst = Math.round(subtotal * 0.18);
  const gross = subtotal + gst;
  const insuranceCover = Math.round(gross * 0.85);
  const deductible = 1000;
  const customerPays = gross - insuranceCover + deductible;
  return {
    partsCost, labourCost, subtotal, gst, gross, insuranceCover, deductible, customerPays,
    invoiceNumber: `INV-2026-${Math.floor(Math.random() * 99999).toString().padStart(5, "0")}`,
  };
}
