import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { User, Mail, Calendar, FileText, ShieldCheck, Save, Loader2 } from "lucide-react";

export default function Profile() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [claimStats, setClaimStats] = useState({ total: 0, active: 0, closed: 0 });

  useEffect(() => {
    if (!user) return;
    const fetchProfile = async () => {
      const [profileRes, claimsRes] = await Promise.all([
        supabase.from("profiles" as any).select("full_name").eq("user_id", user.id).maybeSingle(),
        supabase.from("claims" as any).select("status").eq("user_id", user.id),
      ]);
      if (profileRes.data) setFullName((profileRes.data as any).full_name || "");
      if (claimsRes.data) {
        const claims = claimsRes.data as any[];
        setClaimStats({
          total: claims.length,
          active: claims.filter(c => c.status !== "CLAIM_CLOSED" && c.status !== "rejected").length,
          closed: claims.filter(c => c.status === "CLAIM_CLOSED").length,
        });
      }
      setLoading(false);
    };
    fetchProfile();
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles" as any)
        .update({ full_name: fullName.trim() } as any)
        .eq("user_id", user.id);
      if (error) throw error;
      toast({ title: "Profile Updated", description: "Your name has been saved." });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
    setSaving(false);
  };

  if (!user || loading) {
    return (
      <div className="container py-12 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const joinedDate = new Date(user.created_at || Date.now()).toLocaleDateString("en-IN", { dateStyle: "long" });

  return (
    <div className="container max-w-2xl py-12">
      <div className="mb-8 animate-slide-up">
        <h1 className="text-3xl font-bold text-foreground">My Profile</h1>
        <p className="mt-2 text-muted-foreground">Manage your account details and view your activity summary.</p>
      </div>

      {/* Account Summary */}
      <div className="grid grid-cols-3 gap-3 mb-6 animate-slide-up" style={{ animationDelay: "60ms" }}>
        {[
          { icon: FileText, label: "Total Claims", value: claimStats.total, color: "text-primary", bg: "bg-primary/10" },
          { icon: ShieldCheck, label: "Active", value: claimStats.active, color: "text-status-info", bg: "bg-status-info/10" },
          { icon: FileText, label: "Closed", value: claimStats.closed, color: "text-status-success", bg: "bg-status-success/10" },
        ].map(stat => (
          <Card key={stat.label} className="shadow-card">
            <CardContent className="py-4 flex items-center gap-3">
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${stat.bg} ${stat.color}`}>
                <stat.icon className="h-4 w-4" />
              </div>
              <div>
                <p className="text-xl font-bold text-foreground">{stat.value}</p>
                <p className="text-xs text-muted-foreground">{stat.label}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Profile form */}
      <Card className="shadow-elevated mb-6 animate-slide-up" style={{ animationDelay: "120ms" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><User className="h-5 w-5" /> Personal Details</CardTitle>
          <CardDescription>Update your display name shown in claims and communications.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSave} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Full Name</Label>
              <Input
                id="fullName"
                placeholder="e.g. Arjun Sharma"
                value={fullName}
                onChange={e => setFullName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Email Address</Label>
              <div className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 shrink-0" />
                {user.email}
                <span className="ml-auto text-[10px] font-medium bg-status-success/10 text-status-success px-1.5 py-0.5 rounded-full">Verified</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Member Since</Label>
              <div className="flex items-center gap-2 rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4 shrink-0" />
                {joinedDate}
              </div>
            </div>
            <Button type="submit" disabled={saving}>
              {saving ? (
                <span className="flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Saving...</span>
              ) : (
                <span className="flex items-center gap-2"><Save className="h-4 w-4" /> Save Changes</span>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Account info */}
      <Card className="shadow-card animate-slide-up" style={{ animationDelay: "180ms" }}>
        <CardContent className="py-4">
          <p className="text-xs text-muted-foreground text-center">
            Account ID: <span className="font-mono text-[11px]">{user.id.slice(0, 8)}…</span>
            {" "}· To change your email or password, use the Sign In page.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
