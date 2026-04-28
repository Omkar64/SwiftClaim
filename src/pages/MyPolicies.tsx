import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Upload, FileText, Trash2, Plus, AlertTriangle } from "lucide-react";
import { resolveStorageUrl } from "@/lib/storageUrls";

interface PolicyDoc {
  id: string;
  policy_id: string;
  document_url: string;
  resolved_document_url?: string | null;
  document_name: string;
  created_at: string;
  expiry_date?: string | null;
  coverage_type?: string | null;
}

const COVERAGE_TYPES = [
  { value: "comprehensive", label: "Comprehensive" },
  { value: "third_party", label: "Third Party" },
  { value: "od_only", label: "Own Damage (OD) Only" },
  { value: "fire_theft", label: "Fire & Theft" },
];

export default function MyPolicies() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [docs, setDocs] = useState<PolicyDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [policyId, setPolicyId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [coverageType, setCoverageType] = useState("");

  const fetchDocs = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("policy_documents" as any)
      .select("*")
      .order("created_at", { ascending: false });

    const rows = (data as any as PolicyDoc[]) || [];
    const withSignedUrls = await Promise.all(rows.map(async (doc) => ({
      ...doc,
      resolved_document_url: await resolveStorageUrl("policy-documents", doc.document_url),
    })));

    setDocs(withSignedUrls);
    setLoading(false);
  };

  useEffect(() => {
    fetchDocs();
  }, [user]);

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !file || !policyId.trim()) return;

    setUploading(true);
    try {
      const filePath = `${user.id}/${policyId}/${file.name}`;
      const { error: uploadErr } = await supabase.storage
        .from("policy-documents")
        .upload(filePath, file);
      if (uploadErr) throw uploadErr;

      const { data: urlData } = supabase.storage.from("policy-documents").getPublicUrl(filePath);

      const { error: insertErr } = await supabase
        .from("policy_documents" as any)
        .insert({
          user_id: user.id,
          policy_id: policyId.trim(),
          document_url: urlData.publicUrl,
          document_name: file.name,
          expiry_date: expiryDate || null,
          coverage_type: coverageType || null,
        } as any);
      if (insertErr) throw insertErr;

      toast({ title: "Policy Uploaded", description: `Document for ${policyId} uploaded successfully.` });
      setPolicyId("");
      setFile(null);
      setFileName("");
      setExpiryDate("");
      setCoverageType("");
      fetchDocs();
    } catch (err: any) {
      toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
    }
    setUploading(false);
  };

  const handleDelete = async (doc: PolicyDoc) => {
    const { error } = await supabase.from("policy_documents" as any).delete().eq("id", doc.id);
    if (error) {
      toast({ title: "Error", description: "Failed to delete document", variant: "destructive" });
    } else {
      toast({ title: "Deleted", description: "Policy document removed." });
      fetchDocs();
    }
  };

  const isExpired = (expiryDate?: string | null) => {
    if (!expiryDate) return false;
    return new Date(expiryDate) < new Date();
  };

  const isExpiringSoon = (expiryDate?: string | null) => {
    if (!expiryDate) return false;
    const diff = new Date(expiryDate).getTime() - Date.now();
    return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000; // 30 days
  };

  const getCoverageLabel = (val?: string | null) => {
    return COVERAGE_TYPES.find(t => t.value === val)?.label || val || "";
  };

  if (!user) {
    return (
      <div className="container py-20 text-center">
        <h2 className="text-xl font-bold text-foreground">Please sign in to manage your policies.</h2>
      </div>
    );
  }

  return (
    <div className="container max-w-3xl py-12">
      <div className="mb-8 animate-slide-up">
        <h1 className="text-3xl font-bold text-foreground">My Insurance Policies</h1>
        <p className="mt-2 text-muted-foreground">
          Upload your insurance policy documents here. The eligibility agent will use these to verify your claim coverage.
        </p>
      </div>

      {/* Upload Form */}
      <Card className="shadow-elevated mb-8 animate-slide-up" style={{ animationDelay: "80ms" }}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5" /> Upload Policy Document</CardTitle>
          <CardDescription>Upload your insurance policy PDF or image for automatic eligibility checks</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleUpload} className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="policyId">Policy ID</Label>
                <Input
                  id="policyId"
                  placeholder="e.g. POL-MH-2024-78901"
                  value={policyId}
                  onChange={(e) => setPolicyId(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="coverageType">Coverage Type <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <Select value={coverageType} onValueChange={setCoverageType}>
                  <SelectTrigger id="coverageType">
                    <SelectValue placeholder="Select coverage type" />
                  </SelectTrigger>
                  <SelectContent>
                    {COVERAGE_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="expiryDate">Policy Expiry Date <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Input
                id="expiryDate"
                type="date"
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Policy Document</Label>
              <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border bg-muted/50 p-6 cursor-pointer hover:border-primary/40 transition-colors">
                <Upload className="h-6 w-6 text-muted-foreground" />
                <span className="text-sm text-muted-foreground">
                  {fileName || "Click to upload (PDF, JPG, PNG)"}
                </span>
                <input
                  type="file"
                  accept=".pdf,image/*"
                  className="hidden"
                  required
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    setFileName(f?.name || "");
                    setFile(f || null);
                  }}
                />
              </label>
            </div>
            <Button type="submit" disabled={uploading || !file || !policyId.trim()}>
              {uploading ? "Uploading..." : "Upload Policy"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Existing Docs */}
      <h2 className="text-xl font-semibold text-foreground mb-4">Uploaded Documents</h2>
      {loading ? (
        <div className="text-center py-8">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent mx-auto" />
        </div>
      ) : docs.length === 0 ? (
        <Card className="shadow-card">
          <CardContent className="py-12 text-center">
            <FileText className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
            <p className="text-muted-foreground">No policy documents uploaded yet.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {docs.map((doc) => {
            const expired = isExpired(doc.expiry_date);
            const expiringSoon = isExpiringSoon(doc.expiry_date);
            return (
              <Card
                key={doc.id}
                className={`shadow-card transition-all ${expired ? "border-destructive/30 bg-destructive/3" : expiringSoon ? "border-status-warning/30 bg-status-warning/3" : ""}`}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${expired ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"}`}>
                        <FileText className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-foreground">{doc.policy_id}</p>
                          {doc.coverage_type && (
                            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
                              {getCoverageLabel(doc.coverage_type)}
                            </span>
                          )}
                          {expired && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 border border-destructive/20 px-2 py-0.5 text-[10px] font-bold text-destructive">
                              <AlertTriangle className="h-2.5 w-2.5" /> Expired
                            </span>
                          )}
                          {expiringSoon && !expired && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-status-warning/10 border border-status-warning/20 px-2 py-0.5 text-[10px] font-bold text-status-warning">
                              <AlertTriangle className="h-2.5 w-2.5" /> Expires Soon
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">{doc.document_name}</p>
                        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-0.5">
                          <span>Uploaded: {new Date(doc.created_at).toLocaleDateString()}</span>
                          {doc.expiry_date && (
                            <span className={expired ? "text-destructive font-medium" : expiringSoon ? "text-status-warning font-medium" : ""}>
                              Expires: {new Date(doc.expiry_date).toLocaleDateString("en-IN", { dateStyle: "medium" })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Button variant="outline" size="sm" asChild>
                        <a href={doc.resolved_document_url || doc.document_url} target="_blank" rel="noopener noreferrer">View</a>
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => handleDelete(doc)} className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
