import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Upload, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { STATE_LABELS, type ClaimStep } from "@/lib/claimStateMachine";

interface DisputeDialogProps {
  open: boolean;
  onClose: () => void;
  claimId: string;
  claimNumber: string;
  completedSteps: ClaimStep[];
}

// Only AI-assessed steps that users can meaningfully challenge
const DISPUTABLE_STATES = [
  "DAMAGE_ASSESSED",
  "SURVEY_COMPLETED",
  "REPAIR_COMPLETED",
  "BILL_GENERATED",
];

export function DisputeDialog({
  open, onClose, claimId, claimNumber, completedSteps,
}: DisputeDialogProps) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [stepState, setStepState] = useState("");
  const [reason, setReason] = useState("");
  const [counterFile, setCounterFile] = useState<File | null>(null);
  const [counterFileName, setCounterFileName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const disputableCompleted = completedSteps.filter(
    (s) => s.status === "completed" && DISPUTABLE_STATES.includes(s.state)
  );

  const handleSubmit = async () => {
    if (!user || !stepState || reason.trim().length < 20) return;
    setSubmitting(true);

    try {
      let counterImageUrl: string | null = null;

      if (counterFile) {
        const filePath = `${user.id}/${claimId}/dispute-${Date.now()}-${counterFile.name}`;
        const { error: uploadErr } = await supabase.storage
          .from("claim-images")
          .upload(filePath, counterFile);
        if (!uploadErr) {
          const { data: urlData } = supabase.storage.from("claim-images").getPublicUrl(filePath);
          counterImageUrl = urlData.publicUrl;
        }
      }

      const { error } = await supabase
        .from("claim_disputes" as any)
        .insert({
          claim_id: claimId,
          user_id: user.id,
          step_state: stepState,
          reason: reason.trim(),
          counter_image_url: counterImageUrl,
        } as any);

      if (error) throw error;

      setSubmitted(true);
      toast({
        title: "Dispute Submitted",
        description: "An admin will review your dispute and respond shortly.",
      });
    } catch (err: any) {
      toast({
        title: "Submission failed",
        description: err.message || "Please try again.",
        variant: "destructive",
      });
    }
    setSubmitting(false);
  };

  const handleClose = () => {
    setStepState("");
    setReason("");
    setCounterFile(null);
    setCounterFileName("");
    setSubmitted(false);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-status-warning" />
            Raise a Dispute — {claimNumber}
          </DialogTitle>
          <DialogDescription>
            Disagree with an AI assessment? Submit a dispute and our admin team will review it.
          </DialogDescription>
        </DialogHeader>

        {submitted ? (
          <div className="py-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-status-success/10 mx-auto mb-4">
              <CheckCircle2 className="h-7 w-7 text-status-success" />
            </div>
            <h3 className="font-semibold text-foreground text-lg">Dispute Submitted!</h3>
            <p className="text-sm text-muted-foreground mt-2">
              An admin will review your dispute within 24 hours and update you on the outcome.
            </p>
            <Button className="mt-6" onClick={handleClose}>Close</Button>
          </div>
        ) : (
          <>
            <div className="space-y-4 py-2">
              {/* Step selector */}
              <div className="space-y-2">
                <Label>Which step are you disputing? <span className="text-destructive">*</span></Label>
                <Select value={stepState} onValueChange={setStepState}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a completed step" />
                  </SelectTrigger>
                  <SelectContent>
                    {disputableCompleted.length === 0 ? (
                      <SelectItem value="_none" disabled>No disputable steps yet</SelectItem>
                    ) : (
                      disputableCompleted.map((s) => (
                        <SelectItem key={s.state} value={s.state}>
                          {STATE_LABELS[s.state as keyof typeof STATE_LABELS] || s.label}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Reason */}
              <div className="space-y-2">
                <Label>
                  Reason for dispute <span className="text-destructive">*</span>
                  <span className="text-muted-foreground font-normal ml-1">(min 20 chars)</span>
                </Label>
                <Textarea
                  placeholder="Describe why you disagree with this step's assessment. Be specific — e.g. 'The damage assessment missed the rear bumper damage visible in my photos.'"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  className="resize-none"
                />
                <p className={`text-xs ${reason.length < 20 && reason.length > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                  {reason.length}/20 minimum characters
                </p>
              </div>

              {/* Counter photo upload */}
              <div className="space-y-2">
                <Label>Counter evidence photo <span className="text-muted-foreground font-normal">(optional)</span></Label>
                <label className="flex items-center gap-3 rounded-lg border-2 border-dashed border-border bg-muted/30 px-4 py-3 cursor-pointer hover:border-primary/40 transition-colors">
                  <Upload className="h-5 w-5 text-muted-foreground shrink-0" />
                  <span className="text-sm text-muted-foreground truncate">
                    {counterFileName || "Upload a photo as evidence"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      setCounterFile(file || null);
                      setCounterFileName(file?.name || "");
                    }}
                  />
                </label>
              </div>

              <div className="rounded-lg bg-muted/40 border border-border p-3 text-xs text-muted-foreground">
                <strong className="text-foreground">What happens next?</strong> An admin will review your dispute
                and the original AI assessment. You'll see the resolution status on your claim timeline.
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleClose} disabled={submitting}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmit}
                disabled={submitting || !stepState || reason.trim().length < 20 || disputableCompleted.length === 0}
                className="gap-2"
              >
                {submitting ? (
                  <><Loader2 className="h-4 w-4 animate-spin" /> Submitting…</>
                ) : (
                  <><AlertTriangle className="h-4 w-4" /> Submit Dispute</>
                )}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
