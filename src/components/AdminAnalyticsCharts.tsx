import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from "recharts";
import { CLAIM_STATES, STATE_LABELS, type ClaimState } from "@/lib/claimStateMachine";
import { Bot, Cpu } from "lucide-react";

interface ClaimRow {
  status: string;
  created_at: string;
  steps?: Array<{ status?: string; ai_processed?: boolean }>;
}

const PIE_COLORS = [
  "hsl(217, 91%, 50%)",
  "hsl(142, 71%, 45%)",
  "hsl(38, 92%, 50%)",
  "hsl(0, 72%, 51%)",
  "hsl(210, 80%, 60%)",
  "hsl(280, 60%, 55%)",
  "hsl(170, 60%, 45%)",
  "hsl(330, 65%, 50%)",
  "hsl(50, 80%, 50%)",
  "hsl(200, 70%, 50%)",
  "hsl(120, 50%, 40%)",
  "hsl(260, 50%, 55%)",
  "hsl(15, 75%, 50%)",
];

const AI_COLOR   = "hsl(142, 71%, 45%)";   // green
const FALL_COLOR = "hsl(38, 92%, 50%)";     // amber

export function AdminAnalyticsCharts({ claims }: { claims: ClaimRow[] }) {
  // Claims by status
  const statusCounts: Record<string, number> = {};
  claims.forEach(c => {
    const label = STATE_LABELS[c.status as ClaimState] || c.status;
    statusCounts[label] = (statusCounts[label] || 0) + 1;
  });
  const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name, value }));

  // Monthly trend (last 6 months)
  const monthlyData: Record<string, number> = {};
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    monthlyData[key] = 0;
  }
  claims.forEach(c => {
    const d = new Date(c.created_at);
    const key = d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
    if (key in monthlyData) monthlyData[key]++;
  });
  const trendData = Object.entries(monthlyData).map(([month, count]) => ({ month, count }));

  // AI vs Fallback — scan completed steps across all claims
  let aiCount = 0;
  let fallbackCount = 0;
  // Per-agent breakdown: count AI vs fallback per state label
  const perAgentAI: Record<string, number> = {};
  const perAgentFallback: Record<string, number> = {};

  claims.forEach(c => {
    (c.steps ?? []).forEach(step => {
      if (step.status !== "completed") return;
      if (step.ai_processed) {
        aiCount++;
        // derive step label from state if available
      } else {
        fallbackCount++;
      }
    });
  });

  const totalSteps = aiCount + fallbackCount;
  const aiPct = totalSteps ? Math.round((aiCount / totalSteps) * 100) : 0;
  const fallbackPct = totalSteps ? 100 - aiPct : 0;
  const aiPieData = [
    { name: "AI (Gemini)", value: aiCount },
    { name: "System Fallback", value: fallbackCount },
  ];

  // Per-state AI processing breakdown (bar chart)
  const stateAIData = CLAIM_STATES.map(state => {
    let ai = 0, fallback = 0;
    claims.forEach(c => {
      const step = (c.steps ?? []).find((s: any) => s.state === state && s.status === "completed");
      if (step) {
        step.ai_processed ? ai++ : fallback++;
      }
    });
    return { state: STATE_LABELS[state].replace(/ /g, "\n"), ai, fallback };
  }).filter(d => d.ai + d.fallback > 0);

  return (
    <div className="space-y-6 mb-8">
      <div className="grid md:grid-cols-2 gap-6">
        <Card className="shadow-card animate-slide-up">
          <CardHeader>
            <CardTitle className="text-base">Claims by Status</CardTitle>
          </CardHeader>
          <CardContent>
            {statusData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <PieChart>
                  <Pie data={statusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                    {statusData.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="shadow-card animate-slide-up" style={{ animationDelay: "60ms" }}>
          <CardHeader>
            <CardTitle className="text-base">Monthly Trend</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={trendData}>
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" fill="hsl(217, 91%, 50%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* AI vs Fallback section */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Pie */}
        <Card className="shadow-card animate-slide-up" style={{ animationDelay: "120ms" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Bot className="h-4 w-4 text-status-success" /> AI vs Fallback
            </CardTitle>
            <p className="text-xs text-muted-foreground">Across {totalSteps} completed steps</p>
          </CardHeader>
          <CardContent>
            {totalSteps === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No completed steps yet</p>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={210}>
                  <PieChart>
                    <Pie
                      data={aiPieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%" cy="50%"
                      innerRadius={55}
                      outerRadius={85}
                      paddingAngle={3}
                    >
                      <Cell fill={AI_COLOR} />
                      <Cell fill={FALL_COLOR} />
                    </Pie>
                    <Tooltip formatter={(val: number) => [`${val} steps`, ""]} />
                    <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Centre label overlay */}
                <div className="flex justify-center gap-6 mt-1">
                  <div className="text-center">
                    <p className="text-2xl font-extrabold text-status-success">{aiPct}%</p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 justify-center"><Bot className="h-3 w-3" />AI</p>
                  </div>
                  <div className="text-center">
                    <p className="text-2xl font-extrabold text-status-warning">{fallbackPct}%</p>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1 justify-center"><Cpu className="h-3 w-3" />Fallback</p>
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Per-state stacked bar */}
        <Card className="shadow-card animate-slide-up md:col-span-2" style={{ animationDelay: "180ms" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">AI Processing by Pipeline Stage</CardTitle>
            <p className="text-xs text-muted-foreground">Gemini vs system fallback per agent step</p>
          </CardHeader>
          <CardContent>
            {stateAIData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No completed steps yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={stateAIData} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="state" tick={{ fontSize: 9 }} width={90} />
                  <Tooltip />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="ai" name="AI (Gemini)" stackId="a" fill={AI_COLOR} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="fallback" name="Fallback" stackId="a" fill={FALL_COLOR} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

