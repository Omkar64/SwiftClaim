
-- Add paused column to claims table
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS paused BOOLEAN DEFAULT false;
