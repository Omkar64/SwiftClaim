import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/StatusBadge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import {
  Search, User, FileText, ChevronRight, ExternalLink,
  Calendar, Shield, ShieldAlert,
} from "lucide-react";

interface UserRow {
  user_id: string;
  full_name: string | null;
  created_at: string;
  role: string;
  claim_count: number;
  email?: string;
}

interface ClaimRow {
  id: string;
  claim_number: string;
  status: string;
  vehicle_number: string;
  description: string;
  created_at: string;
  policy_id: string;
  location: string;
  paused?: boolean;
}

interface PolicyDoc {
  id: string;
  document_name: string;
  document_type: string | null;
  document_url: string;
  created_at: string;
  policy_id: string;
}

export function AdminUserManagement() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [userClaims, setUserClaims] = useState<ClaimRow[]>([]);
  const [userPolicies, setUserPolicies] = useState<PolicyDoc[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [panelTab, setPanelTab] = useState<"claims" | "policies">("claims");

  useEffect(() => {
    fetchUsers();
  }, []);

  async function fetchUsers() {
    setLoading(true);
    // Get all profiles
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, full_name, created_at");

    if (!profiles) { setLoading(false); return; }

    // Get all roles
    const { data: roles } = await supabase
      .from("user_roles" as any)
      .select("user_id, role");

    // Get claim counts per user
    const { data: claims } = await supabase
      .from("claims" as any)
      .select("user_id");

    const roleMap = new Map<string, string>();
    (roles || []).forEach((r: any) => roleMap.set(r.user_id, r.role));

    const claimCountMap = new Map<string, number>();
    (claims || []).forEach((c: any) => {
      claimCountMap.set(c.user_id, (claimCountMap.get(c.user_id) || 0) + 1);
    });

    const rows: UserRow[] = profiles.map((p: any) => ({
      user_id: p.user_id,
      full_name: p.full_name,
      created_at: p.created_at,
      role: roleMap.get(p.user_id) || "user",
      claim_count: claimCountMap.get(p.user_id) || 0,
    }));

    setUsers(rows);
    setLoading(false);
  }

  async function openUserPanel(user: UserRow) {
    setSelectedUser(user);
    setPanelOpen(true);
    setPanelLoading(true);
    setPanelTab("claims");

    const [{ data: claims }, { data: policies }] = await Promise.all([
      supabase.from("claims" as any).select("*").eq("user_id", user.user_id).order("created_at", { ascending: false }),
      supabase.from("policy_documents").select("*").eq("user_id", user.user_id).order("created_at", { ascending: false }),
    ]);

    setUserClaims((claims as any as ClaimRow[]) || []);
    setUserPolicies((policies as any as PolicyDoc[]) || []);
    setPanelLoading(false);
  }

  const filtered = users.filter(u => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      u.full_name?.toLowerCase().includes(q) ||
      u.user_id.toLowerCase().includes(q)
    );
  });

  // Sort: regular users first, then admins; by claim count desc
  const sorted = [...filtered].sort((a, b) => {
    if (a.role === b.role) return b.claim_count - a.claim_count;
    return a.role === "admin" ? 1 : -1;
  });

  return (
    <>
      <Card className="shadow-card animate-slide-up">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <CardTitle className="text-lg flex items-center gap-2">
              <User className="h-5 w-5 text-primary" /> User Management
              <span className="text-sm font-normal text-muted-foreground">({users.length} registered)</span>
            </CardTitle>
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or ID..."
                className="pl-10 h-9"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {loading ? (
            <div className="flex justify-center py-10">
              <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            </div>
          ) : sorted.length === 0 ? (
            <p className="text-center text-muted-foreground py-8 text-sm">No users found.</p>
          ) : (
            <div className="divide-y divide-border -mx-6">
              {sorted.map((u, i) => (
                <div
                  key={u.user_id}
                  className="flex items-center justify-between px-6 py-3 hover:bg-muted/40 transition-colors cursor-pointer group animate-slide-up"
                  style={{ animationDelay: `${i * 30}ms` }}
                  onClick={() => openUserPanel(u)}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${u.role === "admin" ? "bg-destructive/10" : "bg-primary/10"}`}>
                      {u.role === "admin"
                        ? <ShieldAlert className="h-4 w-4 text-destructive" />
                        : <User className="h-4 w-4 text-primary" />
                      }
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-foreground truncate">
                          {u.full_name || "Unnamed User"}
                        </p>
                        {u.role === "admin" && (
                          <Badge variant="destructive" className="text-[10px] py-0 px-1.5 h-4">Admin</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate font-mono">
                        {u.user_id.slice(0, 16)}…
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 shrink-0">
                    <div className="hidden sm:flex flex-col items-end gap-0.5">
                      <span className="text-xs text-foreground font-medium">
                        {u.claim_count} claim{u.claim_count !== 1 ? "s" : ""}
                      </span>
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date(u.created_at).toLocaleDateString()}
                      </span>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* User Detail Panel */}
      <Sheet open={panelOpen} onOpenChange={setPanelOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          {selectedUser && (
            <>
              <SheetHeader className="pb-4 border-b border-border">
                <div className="flex items-center gap-3">
                  <div className={`flex h-11 w-11 items-center justify-center rounded-full ${selectedUser.role === "admin" ? "bg-destructive/10" : "bg-primary/10"}`}>
                    {selectedUser.role === "admin"
                      ? <ShieldAlert className="h-5 w-5 text-destructive" />
                      : <User className="h-5 w-5 text-primary" />
                    }
                  </div>
                  <div>
                    <SheetTitle className="text-base">
                      {selectedUser.full_name || "Unnamed User"}
                    </SheetTitle>
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{selectedUser.user_id}</p>
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap text-xs text-muted-foreground mt-2">
                  <span className="flex items-center gap-1"><Calendar className="h-3 w-3" /> Joined {new Date(selectedUser.created_at).toLocaleDateString()}</span>
                  <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {selectedUser.claim_count} claims</span>
                  <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> {selectedUser.role}</span>
                </div>
              </SheetHeader>

              {/* Tab bar */}
              <div className="flex gap-0 border-b border-border mt-4">
                {(["claims", "policies"] as const).map(tab => (
                  <button
                    key={tab}
                    onClick={() => setPanelTab(tab)}
                    className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors capitalize ${
                      panelTab === tab
                        ? "border-primary text-primary"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab === "claims" ? `Claims (${userClaims.length})` : `Policies (${userPolicies.length})`}
                  </button>
                ))}
              </div>

              {panelLoading ? (
                <div className="flex justify-center py-10">
                  <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
                </div>
              ) : panelTab === "claims" ? (
                <div className="mt-4 space-y-3">
                  {userClaims.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8 text-sm">No claims filed.</p>
                  ) : userClaims.map(claim => (
                    <Card key={claim.id} className={`shadow-card ${claim.paused ? "border-status-warning/40 bg-status-warning/5" : ""}`}>
                      <CardContent className="py-3 px-4">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="text-sm font-semibold text-foreground">{claim.claim_number}</span>
                              <StatusBadge status={claim.status} />
                            </div>
                            <p className="text-xs text-muted-foreground line-clamp-1">{claim.description}</p>
                            <div className="flex gap-3 mt-1 text-xs text-muted-foreground flex-wrap">
                              <span>Vehicle: {claim.vehicle_number}</span>
                              <span>Policy: {claim.policy_id}</span>
                              <span>{new Date(claim.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  {userPolicies.length === 0 ? (
                    <p className="text-center text-muted-foreground py-8 text-sm">No policy documents uploaded.</p>
                  ) : userPolicies.map(doc => (
                    <Card key={doc.id} className="shadow-card">
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-foreground truncate">{doc.document_name}</p>
                            <div className="flex gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                              {doc.document_type && <span className="capitalize">{doc.document_type}</span>}
                              <span>Policy: {doc.policy_id}</span>
                              <span>{new Date(doc.created_at).toLocaleDateString()}</span>
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="shrink-0"
                          >
                            <a href={doc.document_url} target="_blank" rel="noopener noreferrer">
                              <ExternalLink className="h-4 w-4" />
                            </a>
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
