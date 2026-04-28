
CREATE TABLE public.claim_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  claim_id UUID NOT NULL,
  user_id UUID NOT NULL,
  image_url TEXT NOT NULL,
  label TEXT DEFAULT 'damage',
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  image_timestamp TIMESTAMPTZ,
  metadata_valid BOOLEAN NOT NULL DEFAULT false,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.claim_images ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_claim_images_claim_id ON public.claim_images(claim_id);

CREATE POLICY "Users can view own claim images"
  ON public.claim_images FOR SELECT
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can upload own claim images"
  ON public.claim_images FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own claim images"
  ON public.claim_images FOR DELETE
  USING (auth.uid() = user_id);
