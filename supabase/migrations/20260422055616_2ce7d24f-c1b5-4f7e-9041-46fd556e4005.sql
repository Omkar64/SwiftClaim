
-- 1. Make policy-documents bucket private
UPDATE storage.buckets SET public = false WHERE id = 'policy-documents';

-- Drop any existing permissive policies on policy-documents
DROP POLICY IF EXISTS "Public can view policy documents" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view policy documents" ON storage.objects;
DROP POLICY IF EXISTS "Policy documents are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own policy documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own policy documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own policy documents" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own policy documents" ON storage.objects;

-- Owner-scoped policies: file path must start with auth.uid()/...
CREATE POLICY "Policy docs: owner or admin can read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'policy-documents'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

CREATE POLICY "Policy docs: owner can upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'policy-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Policy docs: owner can update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'policy-documents'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Policy docs: owner or admin can delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'policy-documents'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

-- 2. Restrict claim-images bucket listing/reads to owners + admins
DROP POLICY IF EXISTS "Public can view claim images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view claim images" ON storage.objects;
DROP POLICY IF EXISTS "Claim images are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Users can view own claim images obj" ON storage.objects;
DROP POLICY IF EXISTS "Users can upload own claim images obj" ON storage.objects;
DROP POLICY IF EXISTS "Users can update own claim images obj" ON storage.objects;
DROP POLICY IF EXISTS "Users can delete own claim images obj" ON storage.objects;

CREATE POLICY "Claim images: owner or admin can read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'claim-images'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

CREATE POLICY "Claim images: owner can upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'claim-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Claim images: owner can update"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'claim-images'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Claim images: owner or admin can delete"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'claim-images'
  AND (
    auth.uid()::text = (storage.foldername(name))[1]
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  )
);

-- Make claim-images bucket private (use signed URLs in the app for sharing)
UPDATE storage.buckets SET public = false WHERE id = 'claim-images';

-- 3. Prevent privilege escalation on user_roles
-- Only admins can insert/update/delete roles. Regular users cannot grant themselves admin.
DROP POLICY IF EXISTS "Users can insert own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can update own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Users can delete own roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can insert roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;

CREATE POLICY "Admins can insert roles"
ON public.user_roles FOR INSERT
TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can update roles"
ON public.user_roles FOR UPDATE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY "Admins can delete roles"
ON public.user_roles FOR DELETE
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::public.app_role));
