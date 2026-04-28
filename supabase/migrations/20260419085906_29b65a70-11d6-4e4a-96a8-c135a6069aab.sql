-- Role enum and user_roles table
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  full_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Auto-create profile + role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, NEW.raw_user_meta_data ->> 'full_name');
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Claims
CREATE TABLE public.claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_number TEXT NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  policy_id TEXT NOT NULL,
  vehicle_number TEXT NOT NULL,
  description TEXT NOT NULL,
  location TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  damage_image_url TEXT,
  garage TEXT,
  spare_parts JSONB DEFAULT '[]'::jsonb,
  billing JSONB,
  steps JSONB NOT NULL DEFAULT '[]'::jsonb,
  awaiting_confirmation BOOLEAN DEFAULT false,
  pending_step INTEGER DEFAULT 0,
  paused BOOLEAN DEFAULT false,
  fraud_analysis JSONB,
  incident_datetime TIMESTAMPTZ,
  vehicle_type TEXT,
  damage_severity TEXT,
  image_latitude DOUBLE PRECISION,
  image_longitude DOUBLE PRECISION,
  image_timestamp TIMESTAMPTZ,
  image_metadata_valid BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own claims" ON public.claims FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Users can create own claims" ON public.claims FOR INSERT
  WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own claims" ON public.claims FOR UPDATE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete claims" ON public.claims FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can view own roles" ON public.user_roles FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_claims_updated_at
BEFORE UPDATE ON public.claims
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER PUBLICATION supabase_realtime ADD TABLE public.claims;

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('claim-images', 'claim-images', true);

CREATE POLICY "Authenticated users can upload claim images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'claim-images');

CREATE POLICY "Anyone can view claim images"
ON storage.objects FOR SELECT
USING (bucket_id = 'claim-images');

-- Policy documents
CREATE TABLE public.policy_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  policy_id TEXT NOT NULL,
  document_url TEXT NOT NULL,
  document_name TEXT NOT NULL,
  document_type TEXT DEFAULT 'policy',
  expiry_date DATE,
  coverage_type TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.policy_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own policy docs"
ON public.policy_documents FOR SELECT
USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Users can upload own policy docs"
ON public.policy_documents FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own policy docs"
ON public.policy_documents FOR DELETE
USING (auth.uid() = user_id);

INSERT INTO storage.buckets (id, name, public) VALUES ('policy-documents', 'policy-documents', true);

CREATE POLICY "Users can upload own policy documents"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'policy-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Anyone can view policy documents"
ON storage.objects FOR SELECT
USING (bucket_id = 'policy-documents');

CREATE POLICY "Users can delete own policy documents"
ON storage.objects FOR DELETE
USING (bucket_id = 'policy-documents' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Admin audit log
CREATE TABLE public.admin_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  admin_user_id UUID NOT NULL,
  claim_id UUID NOT NULL,
  action TEXT NOT NULL,
  details TEXT,
  previous_status TEXT,
  new_status TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view audit logs"
ON public.admin_audit_log FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert audit logs"
ON public.admin_audit_log FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Claim disputes
CREATE TABLE public.claim_disputes (
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

ALTER TABLE public.claim_disputes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can create own disputes"
  ON public.claim_disputes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view own disputes"
  ON public.claim_disputes FOR SELECT
  USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update disputes"
  ON public.claim_disputes FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_claim_disputes_updated_at
  BEFORE UPDATE ON public.claim_disputes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Claim images
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