// Membership tiers for Bourbon Brothers — Free "Community" vs paid "Reserve".
// Source of truth for the model: the approved Membership Tier Sheet
// (~/workspace/goals/bourbon-brothers-collective-app-store-conversion/files/
//  bourbon-brothers-tier-sheet/bourbon-brothers-tier-sheet.pdf).
//
// FREE ("Community") — $0: profile, public feed, browse store inventory, view events.
// RESERVE — $4.99/mo auto-renewable subscription: everything in Free, plus
//   joining communities (public + private hunting groups), direct messaging
//   (members and businesses), bottle-drop alerts / priority drop & release alerts.
// Explicitly NOT a perk: ad-free. Hunters want product ads (drops, rare finds) —
// do not implement any ad-free logic.
//
// IAP plumbing (iOS):
//   - Product ID (create in App Store Connect): com.bourbonbrothers.reserve_monthly
//   - RevenueCat entitlement ID: "reserve"
//   - RevenueCat public iOS API key: injected at build time via the
//     VITE_REVENUECAT_IOS_KEY env var (GitHub secret VITE_REVENUECAT_IOS_KEY).
//     Until Brian fills it in, purchases stay disabled and everyone is Free.

export type MembershipTier = "free" | "reserve";

export const RESERVE_PRODUCT_ID = "com.bourbonbrothers.reserve_monthly";
export const RESERVE_ENTITLEMENT_ID = "reserve";
export const RESERVE_MONTHLY_PRICE_LABEL = "$4.99";

const RAW_KEY = (import.meta.env.VITE_REVENUECAT_IOS_KEY as string | undefined)?.trim() || "";

/** True once Brian has pasted a real RevenueCat public iOS API key into the build. */
export function isRevenueCatConfigured(): boolean {
  return (
    RAW_KEY.length > 0 &&
    !RAW_KEY.startsWith("REPLACE") &&
    !RAW_KEY.startsWith("YOUR_") &&
    !RAW_KEY.startsWith("TODO")
  );
}

export function revenueCatIosKey(): string {
  return RAW_KEY;
}

/** Reserve pitch bullets for the paywall — mirrors the tier sheet, no ad-free. */
export const RESERVE_PERKS: string[] = [
  "Join communities — public and private hunting groups",
  "Message anyone — members and businesses",
  "Bottle-drop alerts from your stores",
  "Priority drop & release alerts",
  "Event RSVPs, priority spots, and member-only events",
];
