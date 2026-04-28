
-- Create policy_documents table for uploaded insurance docs
CREATE TABLE public.policy_documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  policy_id TEXT NOT NULL,
  document_url TEXT NOT NULL,
  document_name TEXT NOT NULL,
  document_type TEXT DEFAULT 'policy',
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

-- Create storage bucket for policy documents
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

-- Add awaiting_confirmation column to claims for step-by-step flow
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS awaiting_confirmation BOOLEAN DEFAULT false;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS pending_step INTEGER DEFAULT 0;
