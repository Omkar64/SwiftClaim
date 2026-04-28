import type { ClaimStep } from "@/lib/claimStateMachine";
import { STATE_LABELS, CLAIM_STATES } from "@/lib/claimStateMachine";

interface ClaimData {
  id: string;
  claim_number: string;
  policy_id: string;
  vehicle_number: string;
  description: string;
  location: string;
  status: string;
  garage: string | null;
  billing: Record<string, number | string> | null;
  steps: ClaimStep[];
  created_at: string;
}

// Converts a camelCase key to "Title Case"
function formatBillingKey(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (s) => s.toUpperCase())
    .trim();
}

// Draw a horizontal rule
function hRule(doc: any, y: number, left = 14, right = 196) {
  doc.setDrawColor(220, 220, 220);
  doc.line(left, y, right, y);
}

export async function generateClaimPDF(claim: ClaimData, profileName?: string) {
  // Lazy-load heavy libs so they don't bloat initial bundle
  const [{ jsPDF }, QRCode] = await Promise.all([
    import("jspdf"),
    import("qrcode"),
  ]);

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = 210;
  const pageHeight = 297;
  const leftMargin = 14;
  const rightMargin = 196;
  const contentWidth = rightMargin - leftMargin;

  // ── Colour palette (RGB) ─────────────────────────────────────
  const BRAND_BLUE: [number, number, number] = [37, 99, 235];
  const BRAND_BLUE_LIGHT: [number, number, number] = [219, 234, 254];
  const GRAY_DARK: [number, number, number] = [30, 30, 46];
  const GRAY_MID: [number, number, number] = [100, 116, 139];
  const GRAY_LIGHT: [number, number, number] = [241, 245, 249];
  const SUCCESS_GREEN: [number, number, number] = [22, 163, 74];
  const SUCCESS_LIGHT: [number, number, number] = [220, 252, 231];
  const WARN_AMBER: [number, number, number] = [180, 83, 9];
  const AI_PURPLE: [number, number, number] = [124, 58, 237];
  const AI_LIGHT: [number, number, number] = [237, 233, 254];

  // ── Header band ──────────────────────────────────────────────
  doc.setFillColor(...BRAND_BLUE);
  doc.rect(0, 0, pageWidth, 32, "F");

  // Logo / brand name
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text("SwiftClaim", leftMargin, 14);

  // Tagline
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(186, 210, 255);
  doc.text("AI-Powered Motor Insurance Claims", leftMargin, 20);

  // "CLAIM CLOSED" badge on top-right
  doc.setFillColor(...SUCCESS_GREEN);
  doc.roundedRect(148, 8, 44, 10, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text("CLAIM CLOSED", 152, 14.5);

  // Claim number & generated date
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(claim.claim_number, leftMargin, 28);

  const generatedDate = new Date().toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(186, 210, 255);
  doc.text(`Generated: ${generatedDate}`, rightMargin, 28, { align: "right" });

  let y = 42;

  // ── Claim meta row ────────────────────────────────────────────
  doc.setFillColor(...GRAY_LIGHT);
  doc.rect(leftMargin, y - 4, contentWidth, 22, "F");

  const metaItems = [
    ["Policy", claim.policy_id],
    ["Vehicle", claim.vehicle_number],
    ["Location", claim.location],
    ["Garage", claim.garage || "—"],
  ];
  const colW = contentWidth / metaItems.length;
  metaItems.forEach(([label, value], i) => {
    const x = leftMargin + i * colW + 3;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY_MID);
    doc.text(label.toUpperCase(), x, y + 1);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8.5);
    doc.setTextColor(...GRAY_DARK);
    doc.text(value, x, y + 7);
  });

  // Description
  doc.setFont("helvetica", "italic");
  doc.setFontSize(7.5);
  doc.setTextColor(...GRAY_MID);
  const descLines = doc.splitTextToSize(claim.description, contentWidth - 6) as string[];
  doc.text(descLines[0] ?? "", leftMargin + 3, y + 14);

  y += 26;
  hRule(doc, y);
  y += 6;

  // ── Section: Agent Timeline ───────────────────────────────────
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...BRAND_BLUE);
  doc.text("AGENT PROCESSING TIMELINE", leftMargin, y);
  y += 5;

  // Table header
  const cols = {
    num: leftMargin,
    step: leftMargin + 7,
    agent: leftMargin + 62,
    status: leftMargin + 118,
    badge: leftMargin + 130,
    time: leftMargin + 148,
  };

  doc.setFillColor(...BRAND_BLUE);
  doc.rect(leftMargin, y, contentWidth, 6, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6.5);
  doc.setTextColor(255, 255, 255);
  doc.text("#", cols.num + 1, y + 4);
  doc.text("Step", cols.step, y + 4);
  doc.text("Agent", cols.agent, y + 4);
  doc.text("Status", cols.status, y + 4);
  doc.text("Source", cols.badge, y + 4);
  doc.text("Timestamp", cols.time, y + 4);
  y += 6;

  const steps: ClaimStep[] = Array.isArray(claim.steps) ? claim.steps : [];
  CLAIM_STATES.forEach((state, idx) => {
    const step = steps.find((s) => s.state === state);
    const rowH = 7;
    const isEven = idx % 2 === 0;

    // Row background
    if (isEven) {
      doc.setFillColor(248, 250, 252);
      doc.rect(leftMargin, y, contentWidth, rowH, "F");
    }

    // Status icon & color
    let statusText = "—";
    let statusR = 150, statusG = 150, statusB = 150;
    if (step?.status === "completed") { statusText = "✓"; [statusR, statusG, statusB] = SUCCESS_GREEN; }
    else if (step?.status === "in-progress") { statusText = "⋯"; [statusR, statusG, statusB] = [37, 99, 235]; }
    else if (step?.status === "failed") { statusText = "✗"; [statusR, statusG, statusB] = [220, 38, 38]; }

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(...GRAY_MID);
    doc.text(String(idx + 1), cols.num + 1.5, y + 4.5);

    doc.setTextColor(...GRAY_DARK);
    const stepLabel = STATE_LABELS[state] ?? state;
    doc.text(doc.splitTextToSize(stepLabel, 52)[0] as string, cols.step, y + 4.5);

    doc.setTextColor(...GRAY_MID);
    const agentLabel = step?.agent ?? "—";
    doc.text(doc.splitTextToSize(agentLabel, 52)[0] as string, cols.agent, y + 4.5);

    // Status colored text
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(statusR, statusG, statusB);
    doc.text(statusText, cols.status + 3, y + 4.5);

    // AI/Fallback pill badge
    if (step?.status === "completed" || step?.status === "in-progress") {
      const isAI = step?.ai_processed !== false;
      const [bgR, bgG, bgB] = isAI ? AI_LIGHT : [254, 243, 199];
      const [txR, txG, txB] = isAI ? AI_PURPLE : WARN_AMBER;
      doc.setFillColor(bgR, bgG, bgB);
      doc.roundedRect(cols.badge, y + 1.5, 14, 4, 1, 1, "F");
      doc.setFont("helvetica", "bold");
      doc.setFontSize(5.5);
      doc.setTextColor(txR, txG, txB);
      doc.text(isAI ? "✨ AI" : "⚠ Fallback", cols.badge + 1.5, y + 4.5);
    }

    // Timestamp
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...GRAY_MID);
    const rawTs = (step as any)?.completed_at || step?.timestamp;
    let tsLabel = "—";
    if (rawTs) {
      const parsed = new Date(rawTs);
      tsLabel = isNaN(parsed.getTime())
        ? String(rawTs)
        : parsed.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
    }
    doc.text(tsLabel, cols.time, y + 4.5);

    y += rowH;
  });

  y += 4;
  hRule(doc, y);
  y += 6;

  // ── Section: Billing ─────────────────────────────────────────
  if (claim.billing) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(...BRAND_BLUE);
    doc.text("BILLING BREAKDOWN", leftMargin, y);
    y += 5;

    const billingEntries = Object.entries(claim.billing).filter(
      ([, val]) => typeof val === "number"
    );
    const halfW = contentWidth / 2;

    billingEntries.forEach(([key, val], i) => {
      const isHighlight = key === "customerPays" || key === "gross";
      const isPositive = key === "insuranceCover";
      const label = formatBillingKey(key);
      const amount = `₹${(val as number).toLocaleString()}`;
      const rowH = isHighlight ? 8 : 6;

      if (isHighlight) {
        doc.setFillColor(...BRAND_BLUE_LIGHT);
        doc.rect(leftMargin, y - 1, halfW + 20, rowH, "F");
      } else if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(leftMargin, y - 1, halfW + 20, rowH, "F");
      }

      doc.setFont("helvetica", isHighlight ? "bold" : "normal");
      doc.setFontSize(isHighlight ? 8.5 : 7.5);
      doc.setTextColor(...(isHighlight ? GRAY_DARK : GRAY_MID));
      doc.text(label, leftMargin + 3, y + rowH - 3);

      doc.setFont("helvetica", "bold");
      doc.setFontSize(isHighlight ? 8.5 : 7.5);
      doc.setTextColor(...(isPositive ? SUCCESS_GREEN : isHighlight ? BRAND_BLUE : GRAY_DARK));
      doc.text(amount, leftMargin + halfW + 17, y + rowH - 3, { align: "right" });

      y += rowH;
    });

    y += 4;
    hRule(doc, y);
    y += 6;
  }

  // ── Section: Gate Pass ────────────────────────────────────────
  const gateStep = steps.find((s) => s.state === "GATE_PASS_ISSUED");
  const gatePassNumber = gateStep?.details?.match(/GP-[\w-]+/)?.[0] ?? `GP-${claim.claim_number.replace("CLM-", "")}`;

  doc.setFillColor(...SUCCESS_LIGHT);
  doc.roundedRect(leftMargin, y, contentWidth - 40, 16, 3, 3, "F");

  // Gate pass icon area
  doc.setFillColor(...SUCCESS_GREEN);
  doc.roundedRect(leftMargin, y, 22, 16, 3, 3, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text("GP", leftMargin + 7, y + 10);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...SUCCESS_GREEN);
  doc.text("GATE PASS ISSUED", leftMargin + 26, y + 6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...GRAY_DARK);
  doc.text(gatePassNumber, leftMargin + 26, y + 12);
  doc.setFontSize(7);
  doc.setTextColor(...GRAY_MID);
  doc.text(
    `Vehicle ${claim.vehicle_number} authorized for release from ${claim.garage || "assigned garage"}`,
    leftMargin + 26,
    y + 18,
  );

  // ── QR Code ───────────────────────────────────────────────────
  const qrUrl = `${window.location.origin}/claim/${claim.id}`;
  const qrDataUrl = await QRCode.default.toDataURL(qrUrl, {
    width: 256,
    margin: 1,
    color: { dark: "#1e1e2e", light: "#ffffff" },
  });

  const qrSize = 28;
  const qrX = rightMargin - qrSize;
  const qrY = y - 2;
  doc.addImage(qrDataUrl, "PNG", qrX, qrY, qrSize, qrSize);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(5.5);
  doc.setTextColor(...GRAY_MID);
  doc.text("Scan to view live claim", qrX, qrY + qrSize + 3.5, { align: "left" });

  // ── Footer ────────────────────────────────────────────────────
  doc.setFillColor(...GRAY_DARK);
  doc.rect(0, pageHeight - 10, pageWidth, 10, "F");
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Generated by SwiftClaim  ·  ${generatedDate}  ·  ${profileName ? `Policyholder: ${profileName}` : claim.policy_id}`,
    pageWidth / 2,
    pageHeight - 4,
    { align: "center" }
  );

  // Save
  doc.save(`SwiftClaim-${claim.claim_number}.pdf`);
}
