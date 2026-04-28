
-- 1. Promote the existing user to admin so they can access the admin portal
INSERT INTO public.user_roles (user_id, role)
VALUES ('4a5a4286-5d6f-41dd-bc1a-1d9fecfb6454', 'admin')
ON CONFLICT DO NOTHING;

-- 2. Add a column to store structured policy verification + covered parts list
ALTER TABLE public.claims
  ADD COLUMN IF NOT EXISTS policy_verification jsonb;

COMMENT ON COLUMN public.claims.policy_verification IS
  'Structured AI output from the eligibility agent: authenticity, holder/vehicle match, coverage type, sum_insured, deductible, covered_parts[], excluded_parts[], conditions[], decision';
