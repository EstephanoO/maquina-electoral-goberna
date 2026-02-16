-- 004_access_requests_permissions.sql
-- Add permission fields to access_requests table to track requested permissions.

ALTER TABLE public.access_requests
  ADD COLUMN IF NOT EXISTS perm_tierra BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS perm_digital BOOLEAN NOT NULL DEFAULT true;
