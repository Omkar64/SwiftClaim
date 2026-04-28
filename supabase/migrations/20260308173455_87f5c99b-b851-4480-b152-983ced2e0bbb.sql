
-- Add new columns to claims table (nullable, backward compatible)
ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS incident_datetime TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vehicle_type TEXT,
  ADD COLUMN IF NOT EXISTS damage_severity TEXT;

-- Create claim_disputes table
CREATE TABLE IF NOT EXISTS public.claim_disputes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_id UUID NOT NULL,
  user_id UUID NOT NULL,
  step_state TEXT NOT NULL,
  reason TEXT NOT NULL,
  counter_image_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  admin_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.claim_disputes ENABLE ROW LEVEL SECURITY;

-- Users can create disputes for their own claims
CREATE POLICY "Users can create own disputes"
  ON public.claim_disputes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can view their own disputes
CREATE POLICY "Users can view own disputes"
  ON public.claim_disputes FOR SELECT
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

-- Admins can update dispute status/admin_note
CREATE POLICY "Admins can update disputes"
  ON public.claim_disputes FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Timestamp trigger
CREATE TRIGGER update_claim_disputes_updated_at
  BEFORE UPDATE ON public.claim_disputes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
