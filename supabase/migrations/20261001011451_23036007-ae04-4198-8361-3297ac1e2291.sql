-- Membership tiers: Free "Community" vs paid "Reserve" ($4.99/mo via IAP).
--
-- The RevenueCat entitlement is the source of truth for gating; this column is
-- a best-effort mirror (synced by the client after purchase/restore) for
-- analytics and future server-side enforcement. Existing table-level GRANTs and
-- RLS policies ("Users can update their own profile") already cover the column.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS membership_tier text NOT NULL DEFAULT 'free';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_membership_tier_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_membership_tier_check
      CHECK (membership_tier IN ('free', 'reserve'));
  END IF;
END $$;
