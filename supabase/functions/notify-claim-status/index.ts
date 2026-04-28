import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const STATE_LABELS: Record<string, string> = {
  REGISTERED: "Claim Registered",
  ELIGIBILITY_VERIFIED: "Eligibility Verified",
  DAMAGE_ASSESSED: "Damage Assessed",
  GARAGE_ASSIGNED: "Garage Assigned",
  SURVEY_COMPLETED: "Survey Completed",
  INVENTORY_CONFIRMED: "Inventory Confirmed",
  PARTS_DISPATCHED: "Parts Dispatched",
  PARTS_DELIVERED: "Parts Delivered",
  REPAIR_COMPLETED: "Repair Completed",
  BILL_GENERATED: "Bill Generated",
  PAYMENT_CONFIRMED: "Payment Confirmed",
  GATE_PASS_ISSUED: "Gate Pass Issued",
  CLAIM_CLOSED: "Claim Closed",
  rejected: "Claim Rejected",
};

const STATE_MESSAGES: Record<string, string> = {
  REGISTERED: "Your claim has been successfully registered and is being processed.",
  ELIGIBILITY_VERIFIED: "Your policy eligibility has been verified. Your claim qualifies for coverage.",
  DAMAGE_ASSESSED: "Our agent has assessed the damage to your vehicle and identified the affected parts.",
  GARAGE_ASSIGNED: "An authorized garage has been assigned to handle your vehicle repair.",
  SURVEY_COMPLETED: "The surveyor has completed the parts survey for your vehicle.",
  INVENTORY_CONFIRMED: "All required spare parts have been confirmed and reserved from our inventory.",
  PARTS_DISPATCHED: "Spare parts have been dispatched and are on their way to the assigned garage.",
  PARTS_DELIVERED: "All spare parts have been delivered to the garage. Repair will begin shortly.",
  REPAIR_COMPLETED: "Your vehicle repair has been completed and quality checked. Ready for billing.",
  BILL_GENERATED: "Your invoice has been generated. Payment confirmation from admin is pending before gate pass issuance.",
  PAYMENT_CONFIRMED: "Payment has been confirmed. Your vehicle is being prepared for release.",
  GATE_PASS_ISSUED: "Gate pass has been issued! Your vehicle is authorized for pickup from the garage.",
  CLAIM_CLOSED: "Your claim has been fully processed and closed. Thank you for using SwiftClaim.",
  rejected: "Unfortunately, your claim has been reviewed and rejected. Please contact support for assistance.",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    const { claim_id, new_status, claim_number, vehicle_number, garage, admin_note } = await req.json();

    if (!claim_id || !new_status) {
      return new Response(JSON.stringify({ error: "claim_id and new_status required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    // Fetch claim's user profile for email
    const { data: claim } = await admin
      .from("claims")
      .select("user_id, claim_number, vehicle_number, policy_id")
      .eq("id", claim_id)
      .maybeSingle();

    if (!claim) {
      return new Response(JSON.stringify({ error: "Claim not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get user email from auth
    const { data: userData } = await admin.auth.admin.getUserById(claim.user_id);
    const userEmail = userData?.user?.email;
    const userName = userData?.user?.user_metadata?.full_name || "Customer";

    if (!userEmail) {
      return new Response(JSON.stringify({ skipped: true, reason: "No user email" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const statusLabel = STATE_LABELS[new_status] || new_status;
    const statusMessage = STATE_MESSAGES[new_status] || `Your claim status has been updated to ${statusLabel}.`;
    const isRejected = new_status === "rejected";
    const isClosed = new_status === "CLAIM_CLOSED";
    const isGatePass = new_status === "GATE_PASS_ISSUED";

    const accentColor = isRejected ? "#ef4444" : isClosed || isGatePass ? "#22c55e" : "#2563eb";
    const iconEmoji = isRejected ? "❌" : isClosed ? "✅" : isGatePass ? "🚗" : "📋";

    const htmlBody = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
    
    <!-- Header -->
    <div style="background:${accentColor};padding:32px 40px;text-align:center;">
      <div style="font-size:40px;margin-bottom:8px;">${iconEmoji}</div>
      <h1 style="color:#ffffff;margin:0;font-size:22px;font-weight:700;letter-spacing:-0.3px;">Claim Status Update</h1>
      <p style="color:rgba(255,255,255,0.85);margin:6px 0 0;font-size:14px;">SwiftClaim Motor Insurance</p>
    </div>

    <!-- Body -->
    <div style="padding:32px 40px;">
      <p style="color:#374151;font-size:15px;margin:0 0 20px;">Hello <strong>${userName}</strong>,</p>
      
      <div style="background:#f8fafc;border-left:4px solid ${accentColor};border-radius:6px;padding:16px 20px;margin-bottom:24px;">
        <p style="margin:0;color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;">Current Status</p>
        <p style="margin:6px 0 0;color:#111827;font-size:18px;font-weight:700;">${statusLabel}</p>
      </div>

      <p style="color:#4b5563;font-size:14px;line-height:1.6;margin:0 0 24px;">${statusMessage}</p>

      ${admin_note ? `
      <div style="background:${admin_note.startsWith('Your claim was manually advanced') ? '#eff6ff' : '#fefce8'};border:1px solid ${admin_note.startsWith('Your claim was manually advanced') ? '#bfdbfe' : '#fde68a'};border-radius:6px;padding:14px 18px;margin-bottom:24px;">
        <p style="margin:0;color:${admin_note.startsWith('Your claim was manually advanced') ? '#1e40af' : '#92400e'};font-size:12px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;">${admin_note.startsWith('Your claim was manually advanced') ? '🔧 Admin Manual Override' : 'Admin Note'}</p>
        <p style="margin:6px 0 0;color:${admin_note.startsWith('Your claim was manually advanced') ? '#1e3a8a' : '#78350f'};font-size:14px;">${admin_note}</p>
      </div>` : ""}

      <!-- Claim Details -->
      <div style="border:1px solid #e5e7eb;border-radius:8px;padding:20px;margin-bottom:24px;">
        <p style="margin:0 0 12px;color:#374151;font-size:13px;font-weight:600;">Claim Details</p>
        <table style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="color:#9ca3af;font-size:12px;padding:4px 0;width:50%;">Claim Number</td>
            <td style="color:#111827;font-size:12px;font-weight:600;padding:4px 0;">${claim.claim_number}</td>
          </tr>
          <tr>
            <td style="color:#9ca3af;font-size:12px;padding:4px 0;">Vehicle</td>
            <td style="color:#111827;font-size:12px;font-weight:600;padding:4px 0;">${claim.vehicle_number}</td>
          </tr>
          <tr>
            <td style="color:#9ca3af;font-size:12px;padding:4px 0;">Policy ID</td>
            <td style="color:#111827;font-size:12px;font-weight:600;padding:4px 0;">${claim.policy_id}</td>
          </tr>
          ${garage ? `<tr>
            <td style="color:#9ca3af;font-size:12px;padding:4px 0;">Assigned Garage</td>
            <td style="color:#111827;font-size:12px;font-weight:600;padding:4px 0;">${garage}</td>
          </tr>` : ""}
        </table>
      </div>

      <p style="color:#6b7280;font-size:13px;margin:0 0 4px;">You can track your claim in real-time on the SwiftClaim portal.</p>
    </div>

    <!-- Footer -->
    <div style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e5e7eb;">
      <p style="color:#9ca3af;font-size:12px;margin:0;">© 2026 SwiftClaim Motor Insurance · This is an automated notification</p>
    </div>
  </div>
</body>
</html>`;

    // Send via Lovable AI gateway email (using resend-compatible endpoint)
    let emailSent = false;
    if (lovableApiKey) {
      try {
        const emailResp = await fetch("https://ai.gateway.lovable.dev/v1/email/send", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${lovableApiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            to: userEmail,
            subject: `${iconEmoji} SwiftClaim: ${statusLabel} — ${claim.claim_number}`,
            html: htmlBody,
          }),
        });
        emailSent = emailResp.ok;
        if (!emailResp.ok) {
          const errText = await emailResp.text();
          console.error("Email send failed:", errText);
        }
      } catch (e) {
        console.error("Email send error:", e);
      }
    }

    return new Response(JSON.stringify({ success: true, email_sent: emailSent, to: userEmail }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("notify-claim-status error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
