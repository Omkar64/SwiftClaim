CREATE TABLE public.garages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  state TEXT NOT NULL,
  phone TEXT,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  vehicle_types TEXT[] NOT NULL DEFAULT ARRAY['ALL']::TEXT[],
  repair_capabilities TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  cashless_supported BOOLEAN NOT NULL DEFAULT true,
  max_daily_capacity INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.garages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.claims
ADD COLUMN assigned_garage_id UUID REFERENCES public.garages(id) ON DELETE SET NULL;

CREATE INDEX idx_garages_active_city ON public.garages(is_active, city);
CREATE INDEX idx_claims_assigned_garage_id ON public.claims(assigned_garage_id);

CREATE POLICY "Authenticated users can view active garages"
ON public.garages FOR SELECT TO authenticated
USING (is_active OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert garages"
ON public.garages FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update garages"
ON public.garages FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete garages"
ON public.garages FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin'));
