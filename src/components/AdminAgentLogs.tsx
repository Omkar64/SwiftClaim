import { useEffect, useState, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bot, CheckCircle2, AlertCircle, RefreshCw, Clock,
  Cpu, ServerCrash, Zap, Terminal, Wifi, WifiOff, Sparkles,
} from "lucide-react";

interface AgentLogEntry {
  id: string;
  timestamp: string;
  claim_id: string;
  claim_number: string;
  processed_state: string;
  state_label: string;
  ai_processed: boolean;
  agent: string;
  status_code: number;
  execution_time_ms: number | null;
  details: string | null;
}

function AiChip({ aiProcessed }: { aiProcessed: boolean }) {
  return aiProcessed ? (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-status-success/15 text-status-success border border-status-success/25">
      <Bot className="h-3 w-3" /> AI
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-muted text-muted-foreground border border-border">
      <Cpu className="h-3 w-3" /> Fallback
    </span>
  );
}

function StatusChip({ code }: { code: number }) {
  const ok = code >= 200 && code < 300;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
      ok
        ? "bg-status-success/10 text-status-success border-status-success/25"
        : "bg-destructive/10 text-destructive border-destructive/25"
    }`}>
      {ok ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
      {code}
    </span>
  );
}

function formatRelative(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(ts).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function AdminAgentLogs() {
  const [logs, setLogs] = useState<AgentLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [silentRefreshing, setSilentRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [newEntryIds, setNewEntryIds] = useState<Set<string>>(new Set());
  // Track IDs seen before realtime update to highlight new ones
  const prevIdsRef = useRef<Set<string>>(new Set());
  // Debounce realtime triggers so rapid updates don't spam the function
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchLogs = useCallback(async (silent = false) => {
    if (silent) {
      setSilentRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke("get-agent-logs");
      if (fnErr) throw fnErr;
      const incoming: AgentLogEntry[] = data?.invocations ?? [];

      // Detect new entries vs what was shown before
      if (silent && prevIdsRef.current.size > 0) {
        const freshIds = new Set(
          incoming.filter(e => !prevIdsRef.current.has(e.id)).map(e => e.id)
        );
        if (freshIds.size > 0) {
          setNewEntryIds(freshIds);
          // Clear highlight after 3 seconds
          setTimeout(() => setNewEntryIds(new Set()), 3000);
        }
      }

      prevIdsRef.current = new Set(incoming.map(e => e.id));
      setLogs(incoming);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e?.message ?? "Failed to load agent logs");
    } finally {
      setLoading(false);
      setSilentRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchLogs(false);
  }, [fetchLogs]);

  // Supabase Realtime — subscribe to claims table updates
  useEffect(() => {
    const channel = supabase
      .channel("agent-logs-realtime")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "claims" },
        () => {
          // Debounce: wait 600ms after last update before re-fetching
          if (debounceTimer.current) clearTimeout(debounceTimer.current);
          debounceTimer.current = setTimeout(() => {
            fetchLogs(true);
          }, 600);
        }
      )
      .subscribe((status) => {
        setRealtimeConnected(status === "SUBSCRIBED");
      });

    return () => {
      supabase.removeChannel(channel);
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, [fetchLogs]);

  const aiCount = logs.filter(l => l.ai_processed).length;
  const fallbackCount = logs.filter(l => !l.ai_processed).length;

  return (
    <div className="space-y-4 animate-slide-up">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
            <Terminal className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-foreground">Agent Execution Log</h2>
            <p className="text-xs text-muted-foreground">
              Last 20 <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">process-claim</code> invocations
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Realtime status indicator */}
          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-all ${
            realtimeConnected
              ? "bg-status-success/10 text-status-success border-status-success/25"
              : "bg-muted text-muted-foreground border-border"
          }`}>
            {realtimeConnected
              ? <><Wifi className="h-3 w-3" /> Live</>
              : <><WifiOff className="h-3 w-3" /> Offline</>
            }
            {silentRefreshing && <RefreshCw className="h-3 w-3 animate-spin ml-0.5" />}
          </span>

          {lastRefresh && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" /> {formatRelative(lastRefresh.toISOString())}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => fetchLogs(false)} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary chips */}
      {!loading && logs.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-xs font-medium text-foreground">
            <Zap className="h-3 w-3 text-primary" />
            {logs.length} total invocations
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-status-success/10 border border-status-success/20 px-3 py-1 text-xs font-medium text-status-success">
            <Bot className="h-3 w-3" />
            {aiCount} AI-processed
          </span>
          {fallbackCount > 0 && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-muted border border-border px-3 py-1 text-xs font-medium text-muted-foreground">
              <Cpu className="h-3 w-3" />
              {fallbackCount} system fallback
            </span>
          )}
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-4 flex items-center gap-2 text-destructive text-sm">
            <ServerCrash className="h-4 w-4 shrink-0" />
            {error}
          </CardContent>
        </Card>
      )}

      {/* Log table */}
      <Card className="shadow-card">
        <CardHeader className="pb-0 pt-4 px-5">
          <CardTitle className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Invocation History
          </CardTitle>
        </CardHeader>
        <CardContent className="px-0 pb-0">
          <ScrollArea className="h-[520px]">
            {loading ? (
              <div className="p-5 space-y-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-md" />
                ))}
              </div>
            ) : logs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
                <Terminal className="h-8 w-8 opacity-40" />
                <p className="text-sm">No agent invocations found.</p>
                <p className="text-xs">Process a claim to see execution logs here.</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {logs.map((log, i) => {
                  const isNew = newEntryIds.has(log.id);
                  return (
                    <div
                      key={log.id}
                      className={`flex items-start gap-4 px-5 py-3.5 transition-all duration-700 ${
                        isNew
                          ? "bg-primary/5 border-l-2 border-primary"
                          : "hover:bg-muted/40"
                      }`}
                    >
                      {/* Index / new indicator */}
                      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all ${
                        isNew
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      }`}>
                        {isNew ? <Sparkles className="h-3 w-3" /> : i + 1}
                      </span>

                      {/* Main info */}
                      <div className="flex-1 min-w-0 space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="text-xs font-mono font-bold text-primary">
                            {log.claim_number}
                          </code>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-medium">
                            {log.state_label || log.processed_state}
                          </Badge>
                          <AiChip aiProcessed={log.ai_processed} />
                          <StatusChip code={log.status_code} />
                          {isNew && (
                            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold bg-primary/15 text-primary border border-primary/25">
                              NEW
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <Bot className="h-3 w-3 shrink-0" />
                          <span className="font-medium">{log.agent}</span>
                          {log.execution_time_ms != null && (
                            <>
                              <span>·</span>
                              <span>{log.execution_time_ms}ms</span>
                            </>
                          )}
                        </div>
                        {log.details && (
                          <p className="text-xs text-muted-foreground truncate max-w-prose">
                            {log.details}
                          </p>
                        )}
                      </div>

                      {/* Timestamp */}
                      <div className="shrink-0 text-right">
                        <p className="text-xs text-muted-foreground">{formatRelative(log.timestamp)}</p>
                        <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                          {new Date(log.timestamp).toLocaleTimeString("en-IN", {
                            hour: "2-digit", minute: "2-digit", second: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
