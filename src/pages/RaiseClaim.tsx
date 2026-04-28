import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { Send, CheckCircle, CalendarIcon, Car, Gauge, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import MultiImageUpload, { type ImageWithMetadata } from "@/components/MultiImageUpload";

function generateClaimNumber(): string {
  const num = Math.floor(Math.random() * 99999).toString().padStart(5, "0");
  return `CLM-2026-${num}`;
}

const VEHICLE_TYPES = [
  { value: "car", label: "Car / Sedan" },
  { value: "suv", label: "SUV / MUV" },
  { value: "two-wheeler", label: "Two-Wheeler" },
  { value: "commercial", label: "Commercial Vehicle" },
  { value: "ev", label: "Electric Vehicle" },
];

const DAMAGE_SEVERITIES = [
  { value: "minor", label: "Minor — scratches, dents, broken glass", color: "text-status-success" },
  { value: "moderate", label: "Moderate — panel damage, airbag, suspension", color: "text-status-warning" },
  { value: "severe", label: "Severe — total damage / major structural loss", color: "text-destructive" },
];

export default function RaiseClaim() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const [claimNumber, setClaimNumber] = useState("");
  const [claimId, setClaimId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Multi-image state
  const [damageImages, setDamageImages] = useState<ImageWithMetadata[]>([]);

  // Enhanced fields
  const [incidentDate, setIncidentDate] = useState<Date | undefined>(undefined);
  const [vehicleType, setVehicleType] = useState("");
  const [damageSeverity, setDamageSeverity] = useState("");

  // Policy validation
  const [policyIdInput, setPolicyIdInput] = useState("");
  const [policyValid, setPolicyValid] = useState<boolean | null>(null);
  const [checkingPolicy, setCheckingPolicy] = useState(false);
  const [policyInfo, setPolicyInfo] = useState<{ coverage_type: string | null; expiry_date: string | null } | null>(null);

  useEffect(() => {
    if (!policyIdInput.trim() || !user) {
      setPolicyValid(null);
      setPolicyInfo(null);
      return;
    }
    const timer = setTimeout(async () => {
      setCheckingPolicy(true);
      const { data } = await supabase
        .from("policy_documents" as any)
        .select("policy_id, coverage_type, expiry_date")
        .eq("user_id", user.id)
        .eq("policy_id", policyIdInput.trim());

      const docs = data as any[];
      if (docs && docs.length > 0) {
        const doc = docs[0];
        const isExpired = doc.expiry_date && new Date(doc.expiry_date) < new Date();
        setPolicyValid(!isExpired);
        setPolicyInfo({ coverage_type: doc.coverage_type, expiry_date: doc.expiry_date });
      } else {
        setPolicyValid(false);
        setPolicyInfo(null);
      }
      setCheckingPolicy(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [policyIdInput, user]);

  const allImagesValid = damageImages.length >= 1 && damageImages.every((img) => img.hasGPS);

  const canSubmit = () => {
    if (!allImagesValid) return false;
    if (policyValid !== true) return false;
    if (isSubmitting) return false;
    return true;
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!user) {
      toast({ title: "Please sign in", description: "You need to be logged in to submit a claim.", variant: "destructive" });
      navigate("/auth");
      return;
    }
    if (!allImagesValid) {
      toast({ title: "Valid photos required", description: "All damage photos must have GPS metadata.", variant: "destructive" });
      return;
    }
    if (policyValid !== true) {
      toast({ title: "Policy not found", description: "Upload your insurance policy in 'My Policies' before raising a claim.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    const formData = new FormData(e.currentTarget);
    const claimNum = generateClaimNumber();

    try {
      // Upload all images and collect URLs
      const uploadedImages: Array<{
        url: string;
        latitude: number | null;
        longitude: number | null;
        timestamp: string | null;
      }> = [];

      for (let i = 0; i < damageImages.length; i++) {
        const img = damageImages[i];
        const filePath = `${user.id}/${claimNum}/${i}_${img.file.name}`;
        const { error: uploadError } = await supabase.storage
          .from("claim-images")
          .upload(filePath, img.file);

        if (uploadError) {
          console.error("Upload error:", uploadError);
          continue;
        }
        const { data: urlData } = supabase.storage.from("claim-images").getPublicUrl(filePath);
        uploadedImages.push({
          url: urlData.publicUrl,
          latitude: img.latitude,
          longitude: img.longitude,
          timestamp: img.timestamp,
        });
      }

      if (uploadedImages.length === 0) throw new Error("Failed to upload any images");

      // Use first image as primary for backward compat
      const primary = uploadedImages[0];

      const { data: newClaim, error } = await supabase
        .from("claims" as any)
        .insert({
          claim_number: claimNum,
          user_id: user.id,
          policy_id: policyIdInput.trim(),
          vehicle_number: formData.get("vehicleNumber") as string,
          description: formData.get("description") as string,
          location: formData.get("location") as string,
          damage_image_url: primary.url,
          status: "REGISTERED",
          steps: [],
          incident_datetime: incidentDate ? incidentDate.toISOString() : null,
          vehicle_type: vehicleType || null,
          damage_severity: damageSeverity || null,
          image_latitude: primary.latitude,
          image_longitude: primary.longitude,
          image_timestamp: primary.timestamp,
          image_metadata_valid: true,
        } as any)
        .select("id")
        .single();

      if (error) throw error;
      const newClaimId = (newClaim as any).id;

      // Insert all images into claim_images table
      const imageRows = uploadedImages.map((img, i) => ({
        claim_id: newClaimId,
        user_id: user.id,
        image_url: img.url,
        label: i === 0 ? "primary" : `angle-${i + 1}`,
        latitude: img.latitude,
        longitude: img.longitude,
        image_timestamp: img.timestamp,
        metadata_valid: true,
        sort_order: i,
      }));

      await supabase.from("claim_images" as any).insert(imageRows as any);

      setClaimNumber(claimNum);
      setClaimId(newClaimId);
      setSubmitted(true);

      toast({ title: "Claim Registered", description: `Claim ${claimNum} is now being processed by AI agents.` });

      supabase.functions.invoke("process-claim", {
        body: { claim_id: newClaimId, start_step: 0 },
      }).catch(console.error);

    } catch (err: any) {
      toast({ title: "Error", description: err.message || "Failed to submit claim", variant: "destructive" });
    }
    setIsSubmitting(false);
  };

  if (submitted) {
    return (
      <div className="container max-w-lg py-20">
        <Card className="shadow-elevated animate-slide-up">
          <CardContent className="pt-8 pb-8 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-status-success/10 mx-auto mb-5">
              <CheckCircle className="h-8 w-8 text-status-success" />
            </div>
            <h2 className="text-2xl font-bold text-foreground">Claim Registered!</h2>
            <p className="mt-2 text-muted-foreground">AI agents are processing your claim through 13 states.</p>
            <div className="mt-5 rounded-lg bg-muted p-4">
              <p className="text-sm text-muted-foreground">Claim ID</p>
              <p className="text-xl font-bold text-foreground">{claimNumber}</p>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{damageImages.length} damage photo{damageImages.length > 1 ? "s" : ""} uploaded</p>
            <div className="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={() => navigate(`/claim/${claimId}`)}>View Live Status</Button>
              <Button variant="outline" onClick={() => { setSubmitted(false); setDamageImages([]); setIncidentDate(undefined); setVehicleType(""); setDamageSeverity(""); setPolicyIdInput(""); setPolicyValid(null); }}>
                Submit Another
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-2xl py-12">
      <div className="mb-8 animate-slide-up">
        <h1 className="text-3xl font-bold text-foreground">Raise a New Claim</h1>
        <p className="mt-2 text-muted-foreground">Fill in the details below. AI agents will process your claim through 13 validated stages.</p>
      </div>

      <Card className="shadow-elevated animate-slide-up" style={{ animationDelay: "100ms" }}>
        <CardHeader>
          <CardTitle>Claim Details</CardTitle>
          <CardDescription>Providing more detail helps AI agents process faster and more accurately</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Policy & Vehicle */}
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label htmlFor="policyId">Policy ID <span className="text-destructive">*</span></Label>
                <Input id="policyId" name="policyId" placeholder="e.g. POL-MH-2024-78901" required value={policyIdInput} onChange={(e) => setPolicyIdInput(e.target.value)} />
                {checkingPolicy && <p className="text-xs text-muted-foreground">Checking policy...</p>}
                {policyValid === true && policyInfo && (
                  <p className="text-xs text-status-success font-medium flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" /> Policy found{policyInfo.coverage_type && ` — ${policyInfo.coverage_type}`}
                  </p>
                )}
                {policyValid === false && policyIdInput.trim() && !checkingPolicy && (
                  <Alert variant="destructive" className="py-2 px-3">
                    <AlertDescription className="text-xs flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3 shrink-0" /> No policy found. Upload your policy in "My Policies" first.
                    </AlertDescription>
                  </Alert>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="vehicleNumber">Vehicle Number <span className="text-destructive">*</span></Label>
                <Input id="vehicleNumber" name="vehicleNumber" placeholder="e.g. MH-12-AB-4567" required />
              </div>
            </div>

            {/* Vehicle type & severity */}
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><Car className="h-3.5 w-3.5 text-muted-foreground" /> Vehicle Type</Label>
                <Select value={vehicleType} onValueChange={setVehicleType}>
                  <SelectTrigger><SelectValue placeholder="Select vehicle type" /></SelectTrigger>
                  <SelectContent>
                    {VEHICLE_TYPES.map((vt) => (<SelectItem key={vt.value} value={vt.value}>{vt.label}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><Gauge className="h-3.5 w-3.5 text-muted-foreground" /> Damage Severity</Label>
                <Select value={damageSeverity} onValueChange={setDamageSeverity}>
                  <SelectTrigger><SelectValue placeholder="Estimated severity" /></SelectTrigger>
                  <SelectContent>
                    {DAMAGE_SEVERITIES.map((ds) => (
                      <SelectItem key={ds.value} value={ds.value}><span className={ds.color}>{ds.label}</span></SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Date & location */}
            <div className="grid sm:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" /> Incident Date & Time</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !incidentDate && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {incidentDate ? format(incidentDate, "PPP") : "Pick incident date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={incidentDate} onSelect={setIncidentDate} disabled={(date) => date > new Date()} initialFocus className={cn("p-3 pointer-events-auto")} />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label htmlFor="location">Incident Location <span className="text-destructive">*</span></Label>
                <Input id="location" name="location" placeholder="e.g. Pune, Maharashtra" required />
              </div>
            </div>

            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Incident Description <span className="text-destructive">*</span></Label>
              <Textarea id="description" name="description" placeholder="Describe the incident and damage in detail." rows={4} required />
            </div>

            {/* Multi-image upload */}
            <MultiImageUpload
              images={damageImages}
              onImagesChange={setDamageImages}
              maxImages={10}
              minImages={1}
            />

            <Button type="submit" size="lg" className="w-full" disabled={!canSubmit()}>
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  Uploading {damageImages.length} photo{damageImages.length > 1 ? "s" : ""}...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Send className="h-4 w-4" /> Register Claim ({damageImages.length} photo{damageImages.length > 1 ? "s" : ""})
                </span>
              )}
            </Button>

            {/* Validation summary */}
            {(policyValid === false || !allImagesValid) && damageImages.length > 0 && (
              <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 space-y-1">
                <p className="text-xs font-semibold text-destructive">Cannot submit — fix these issues:</p>
                {policyValid === false && <p className="text-xs text-destructive">• Upload your insurance policy in "My Policies" section first</p>}
                {damageImages.some((img) => !img.hasGPS) && <p className="text-xs text-destructive">• Remove photos without GPS data — all photos must be geo-tagged</p>}
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
