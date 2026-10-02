import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { CustomerInfo } from "@revenuecat/purchases-capacitor";
import { useAuth } from "@/hooks/use-auth";
import { isNativeApp } from "@/lib/native";
import {
  RESERVE_ENTITLEMENT_ID,
  isRevenueCatConfigured,
  revenueCatIosKey,
  type MembershipTier,
} from "@/lib/membership";

interface MembershipContextValue {
  /** Current tier. "free" until a Reserve entitlement is confirmed. */
  tier: MembershipTier;
  isReserve: boolean;
  /** True while the initial entitlement check is running. */
  loading: boolean;
  /** True when running inside the native iOS shell. */
  isNative: boolean;
  /** True when a real RevenueCat key was baked into this build. */
  isConfigured: boolean;
  /** Paywall dialog visibility. */
  paywallOpen: boolean;
  openPaywall: () => void;
  closePaywall: () => void;
  /** Purchase a Reserve subscription via RevenueCat. */
  purchaseReserve: () => Promise<void>;
  /** Restore previous purchases. */
  restorePurchases: () => Promise<void>;
  purchaseBusy: boolean;
  purchaseError: string | null;
}

const MembershipContext = createContext<MembershipContextValue | null>(null);

function tierFromCustomerInfo(info: CustomerInfo | null | undefined): MembershipTier {
  if (info?.entitlements?.active?.[RESERVE_ENTITLEMENT_ID]) return "reserve";
  return "free";
}

/** Best-effort: mirror the tier onto the user's own profile row for future
 *  server-side use. Never blocks or throws — the RevenueCat entitlement is
 *  the source of truth, and the column may not exist until the migration lands. */
async function syncTierToProfile(userId: string, tier: MembershipTier) {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { error } = await supabase
      .from("profiles")
      .update({ membership_tier: tier })
      .eq("id", userId);
    if (error) console.warn("[membership] profile sync skipped:", error.message);
  } catch (e) {
    console.warn("[membership] profile sync skipped:", e);
  }
}

export function MembershipProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [tier, setTier] = useState<MembershipTier>("free");
  const [loading, setLoading] = useState(true);
  const [paywallOpen, setPaywallOpen] = useState(false);
  const [purchaseBusy, setPurchaseBusy] = useState(false);
  const [purchaseError, setPurchaseError] = useState<string | null>(null);
  const configuredRef = useRef(false);
  const listenerIdRef = useRef<string | null>(null);

  const isNative = isNativeApp();
  const isConfigured = isRevenueCatConfigured();

  // Configure RevenueCat once per signed-in user (native + key present only).
  useEffect(() => {
    let cancelled = false;
    async function init() {
      setLoading(true);
      try {
        if (!isNativeApp() || !isRevenueCatConfigured() || !user?.id) {
          if (!cancelled) {
            setTier("free");
            setLoading(false);
          }
          return;
        }
        const { Purchases } = await import("@revenuecat/purchases-capacitor");
        if (!configuredRef.current) {
          await Purchases.configure({ apiKey: revenueCatIosKey() });
          configuredRef.current = true;
        }
        await Purchases.logIn({ appUserID: user.id });
        const { customerInfo } = await Purchases.getCustomerInfo();
        if (!cancelled) {
          const next = tierFromCustomerInfo(customerInfo);
          setTier(next);
          void syncTierToProfile(user.id, next);
        }
        // Keep the tier fresh if the entitlement changes elsewhere.
        if (listenerIdRef.current) {
          await Purchases.removeCustomerInfoUpdateListener({
            listenerToRemove: listenerIdRef.current,
          }).catch(() => {});
        }
        listenerIdRef.current = await Purchases.addCustomerInfoUpdateListener(
          (info: CustomerInfo) => {
            if (cancelled) return;
            const next = tierFromCustomerInfo(info);
            setTier(next);
            if (user?.id) void syncTierToProfile(user.id, next);
          },
        );
      } catch (e) {
        console.warn("[membership] RevenueCat init failed:", e);
        if (!cancelled) setTier("free");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void init();
    return () => {
      cancelled = true;
    };
    // Re-run when the signed-in user changes.
  }, [user?.id]);

  const openPaywall = useCallback(() => {
    setPurchaseError(null);
    setPaywallOpen(true);
  }, []);
  const closePaywall = useCallback(() => {
    if (purchaseBusy) return;
    setPaywallOpen(false);
  }, [purchaseBusy]);

  const purchaseReserve = useCallback(async () => {
    setPurchaseError(null);
    if (!isNativeApp() || !isRevenueCatConfigured()) {
      setPurchaseError(
        isNativeApp()
          ? "Subscriptions aren't set up in this build yet — check back soon."
          : "Reserve is available in the Bourbon Brothers iOS app.",
      );
      return;
    }
    setPurchaseBusy(true);
    try {
      const { Purchases } = await import("@revenuecat/purchases-capacitor");
      const { RESERVE_PRODUCT_ID } = await import("@/lib/membership");
      const offerings = await Purchases.getOfferings();
      const allPackages = [
        ...(offerings.current ? Object.values(offerings.current.availablePackages) : []),
        ...Object.values(offerings.all ?? {}).flatMap((o) => Object.values(o.availablePackages)),
      ];
      // Prefer the monthly package of the current offering, fall back to any
      // package whose product matches our subscription product ID.
      const pkg =
        offerings.current?.monthly ??
        allPackages.find((p) => p.product.identifier === RESERVE_PRODUCT_ID);
      if (!pkg) {
        throw new Error(
          "Couldn't find the Reserve subscription in the store. Please try again later.",
        );
      }
      const result = await Purchases.purchasePackage({ aPackage: pkg });
      const next = tierFromCustomerInfo(result.customerInfo);
      setTier(next);
      if (user?.id) void syncTierToProfile(user.id, next);
      if (next === "reserve") setPaywallOpen(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      // User backing out of the Apple sheet is not an error worth surfacing.
      if (/cancel/i.test(message)) return;
      console.warn("[membership] purchase failed:", e);
      setPurchaseError(message || "Purchase failed. Please try again.");
    } finally {
      setPurchaseBusy(false);
    }
  }, [user?.id]);

  const restorePurchases = useCallback(async () => {
    setPurchaseError(null);
    if (!isNativeApp() || !isRevenueCatConfigured()) {
      setPurchaseError(
        isNativeApp()
          ? "Subscriptions aren't set up in this build yet — check back soon."
          : "Reserve is available in the Bourbon Brothers iOS app.",
      );
      return;
    }
    setPurchaseBusy(true);
    try {
      const { Purchases } = await import("@revenuecat/purchases-capacitor");
      const { customerInfo } = await Purchases.restorePurchases();
      const next = tierFromCustomerInfo(customerInfo);
      setTier(next);
      if (user?.id) void syncTierToProfile(user.id, next);
      if (next === "reserve") {
        setPaywallOpen(false);
      } else {
        setPurchaseError("No active Reserve subscription found on this Apple Account.");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.warn("[membership] restore failed:", e);
      setPurchaseError(message || "Restore failed. Please try again.");
    } finally {
      setPurchaseBusy(false);
    }
  }, [user?.id]);

  const value = useMemo<MembershipContextValue>(
    () => ({
      tier,
      isReserve: tier === "reserve",
      loading,
      isNative,
      isConfigured,
      paywallOpen,
      openPaywall,
      closePaywall,
      purchaseReserve,
      restorePurchases,
      purchaseBusy,
      purchaseError,
    }),
    [
      tier,
      loading,
      isNative,
      isConfigured,
      paywallOpen,
      openPaywall,
      closePaywall,
      purchaseReserve,
      restorePurchases,
      purchaseBusy,
      purchaseError,
    ],
  );

  return <MembershipContext.Provider value={value}>{children}</MembershipContext.Provider>;
}

const DEFAULT_MEMBERSHIP: MembershipContextValue = {
  tier: "free",
  isReserve: false,
  loading: false,
  isNative: false,
  isConfigured: false,
  paywallOpen: false,
  openPaywall: () => {
    console.warn("[membership] openPaywall called outside <MembershipProvider>");
  },
  closePaywall: () => {},
  purchaseReserve: async () => {},
  restorePurchases: async () => {},
  purchaseBusy: false,
  purchaseError: null,
};

export function useMembership(): MembershipContextValue {
  const ctx = useContext(MembershipContext);
  // Degrade gracefully outside the provider (tests, isolated renders):
  // free tier, paywall opens are no-ops.
  if (!ctx) return DEFAULT_MEMBERSHIP;
  return ctx;
}
