import { Check, Crown, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useMembership } from "@/hooks/use-membership";
import { RESERVE_MONTHLY_PRICE_LABEL, RESERVE_PERKS } from "@/lib/membership";

/**
 * Reserve paywall. Opens whenever a Free member taps a gated feature
 * (joining a community, sending a message). Pitches Reserve at $4.99/mo.
 *
 * Per the tier sheet: "Free is window shopping. Reserve is the hunt."
 * Ad-free is intentionally NOT a perk — hunters want product ads.
 */
export function PaywallDialog() {
  const {
    paywallOpen,
    closePaywall,
    purchaseReserve,
    restorePurchases,
    purchaseBusy,
    purchaseError,
    isNative,
    isConfigured,
    isReserve,
  } = useMembership();

  if (isReserve) return null;

  const setupPending = !isConfigured;

  return (
    <Dialog open={paywallOpen} onOpenChange={(open) => !open && closePaywall()}>
      <DialogContent
        className="max-w-sm rounded-2xl border-border bg-card p-0 overflow-hidden"
        data-testid="paywall-dialog"
      >
        <div className="relative bg-gradient-amber px-6 pt-8 pb-6 text-primary-foreground">
          <button
            aria-label="Close"
            onClick={closePaywall}
            className="absolute right-3 top-3 rounded-full p-1.5 hover:bg-black/10"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <Crown className="h-6 w-6" />
            <DialogTitle className="font-display text-2xl">Reserve</DialogTitle>
          </div>
          <DialogDescription className="mt-1 text-primary-foreground/90 text-sm">
            Free is window shopping. Reserve is the hunt.
          </DialogDescription>
          <div className="mt-3 flex items-baseline gap-1">
            <span className="font-display text-4xl">{RESERVE_MONTHLY_PRICE_LABEL}</span>
            <span className="text-sm text-primary-foreground/80">/month</span>
          </div>
        </div>

        <div className="px-6 py-5">
          <ul className="space-y-2.5">
            {RESERVE_PERKS.map((perk) => (
              <li key={perk} className="flex items-start gap-2.5 text-sm">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span>{perk}</span>
              </li>
            ))}
          </ul>

          {purchaseError && (
            <p className="mt-4 text-sm text-destructive" data-testid="paywall-error">
              {purchaseError}
            </p>
          )}

          <div className="mt-5 space-y-2">
            {setupPending ? (
              <p className="text-sm text-muted-foreground" data-testid="paywall-pending">
                Reserve subscriptions are coming to the iOS app soon — you're on the list.
                Everything stays free until then.
              </p>
            ) : !isNative ? (
              <p className="text-sm text-muted-foreground" data-testid="paywall-web">
                Reserve is available in the Bourbon Brothers iOS app — open it on your iPhone to
                upgrade.
              </p>
            ) : (
              <>
                <Button
                  className="w-full bg-gradient-amber text-primary-foreground"
                  onClick={() => void purchaseReserve()}
                  disabled={purchaseBusy}
                  data-testid="paywall-subscribe"
                >
                  {purchaseBusy ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Working…
                    </>
                  ) : (
                    <>Continue — {RESERVE_MONTHLY_PRICE_LABEL}/mo</>
                  )}
                </Button>
                <Button
                  variant="ghost"
                  className="w-full text-sm"
                  onClick={() => void restorePurchases()}
                  disabled={purchaseBusy}
                  data-testid="paywall-restore"
                >
                  Restore purchase
                </Button>
              </>
            )}
          </div>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            Auto-renewable subscription. Cancel anytime in iPhone Settings.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
