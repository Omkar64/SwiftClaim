import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { ClipboardList, ArrowRight, Search, X, RefreshCw } from "lucide-react";
import { STATE_LABELS, type ClaimState } from "@/lib/claimStateMachine";

interface AuditEntry {
  id: string;
  action: string;
  details: string | null;
  previous_status: string | null;
  new_status: string | null;
  created_at: string;
  claim_id: string;
  admin_user_id: string;
}

const ACTION_OPTIONS = [
  { value: "all", label: "All Actions" },
  { value: "approve", label: "Approve & Advance" },
  { value: "reject", label: "Reject Claim" },
  { value: "override", label: "State Override" },
  { value: "pause", label: "Pause Claim" },
  { value: "resume", label: "Resume Claim" },
  { value: "confirm_payment", label: "Confirm Payment" },
];

const DATE_OPTIONS = [
  { value: "all", label: "All Time" },
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 Days" },
  { value: "30d", label: "Last 30 Days" },
];

export function AdminAuditLog() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [claimSearch, setClaimSearch] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("admin_audit_log" as any)
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    if (actionFilter !== "all") {
      query = query.eq("action", actionFilter);
    }

    if (dateFilter !== "all") {
      const now = new Date();
      let from: Date;
      if (dateFilter === "today") {
        from = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      } else if (dateFilter === "7d") {
        from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      } else {
        from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      }
      query = query.gte("created_at", from.toISOString());
    }

    const { data } = await query;
    let results = (data as any as AuditEntry[]) || [];

    if (claimSearch.trim()) {
      const s = claimSearch.trim().toLowerCase();
      results = results.filter(e =>
        e.claim_id.toLowerCase().includes(s) ||
        (e.details || "").toLowerCase().includes(s)
      );
    }

    setEntries(results);
    setLoading(false);
  }, [actionFilter, dateFilter, claimSearch, refreshKey]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const clearFilters = () => {
    setActionFilter("all");
    setDateFilter("all");
    setClaimSearch("");
  };

  const hasFilters = actionFilter !== "all" || dateFilter !== "all" || claimSearch !== "";

  const getActionColor = (action: string) => {
    if (action.includes("reject")) return "text-destructive";
    if (action.includes("pause")) return "text-status-warning";
    if (action.includes("resume") || action.includes("approve")) return "text-status-success";
    if (action.includes("payment") || action.includes("override")) return "text-primary";
    return "text-muted-foreground";
  };

  const getActionBg = (action: string) => {
    if (action.includes("reject")) return "bg-destructive/5 border-destructive/20";
    if (action.includes("pause")) return "bg-status-warning/5 border-status-warning/20";
    if (action.includes("resume") || action.includes("approve")) return "bg-status-success/5 border-status-success/20";
    if (action.includes("payment") || action.includes("override")) return "bg-primary/5 border-primary/20";
    return "bg-muted/30 border-border";
  };

  const formatStatus = (s: string | null) => {
    if (!s) return "—";
    return STATE_LABELS[s as ClaimState] || s;
  };

  return (
    <Card className="shadow-card animate-slide-up mb-8">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ClipboardList className="h-4 w-4" /> Admin Audit Log
            {entries.length > 0 && (
              <span className="ml-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                {entries.length}
              </span>
            )}
          </CardTitle>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setRefreshKey(k => k + 1)}
            className="h-7 px-2 text-muted-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2 mt-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search by claim ID or note..."
              value={claimSearch}
              onChange={e => setClaimSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="h-8 text-xs w-full sm:w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ACTION_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dateFilter} onValueChange={setDateFilter}>
            <SelectTrigger className="h-8 text-xs w-full sm:w-[130px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {DATE_OPTIONS.map(o => (
                <SelectItem key={o.value} value={o.value} className="text-xs">{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="h-8 px-2 text-muted-foreground shrink-0">
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {loading ? (
          <div className="flex justify-center py-6">
            <div className="h-6 w-6 animate-spin rounded-full border-3 border-primary border-t-transparent" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {hasFilters ? "No entries match your filters." : "No admin actions recorded yet."}
          </p>
        ) : (
          <ScrollArea className="h-[320px]">
            <div className="space-y-2.5 pr-2">
              {entries.map(entry => (
                <div
                  key={entry.id}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-sm transition-colors ${getActionBg(entry.action)}`}
                >
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold capitalize text-xs ${getActionColor(entry.action)}`}>
                      {entry.action.replace(/_/g, " ")}
                    </p>
                    {entry.previous_status && entry.new_status && (
                      <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
                        <span className="font-medium">{formatStatus(entry.previous_status)}</span>
                        <ArrowRight className="h-3 w-3 inline shrink-0" />
                        <span className="font-medium">{formatStatus(entry.new_status)}</span>
                      </p>
                    )}
                    {entry.details && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{entry.details}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono">
                      Claim: {entry.claim_id.slice(0, 8)}…
                    </p>
                  </div>
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap shrink-0 tabular-nums">
                    {new Date(entry.created_at).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
