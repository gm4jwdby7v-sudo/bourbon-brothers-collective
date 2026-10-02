import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { isNativeApp } from "@/lib/native";

export function AgeGate() {
  const [verified, setVerified] = useState(true);
  const [declined, setDeclined] = useState(false);

  useEffect(() => {
    setVerified(localStorage.getItem("bc_age_verified") === "yes");
  }, []);

  if (verified) return null;

  function handleNo() {
    // On the web, send underage visitors to a responsibility resource. Inside
    // the native app there is no browser chrome to come back from, so just
    // explain instead of navigating the webview away.
    if (isNativeApp()) setDeclined(true);
    else window.location.href = "https://www.responsibility.org/";
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/95 backdrop-blur-xl px-6">
      <div className="relative max-w-md w-full rounded-2xl border border-border bg-card p-8 text-center shadow-soft grain overflow-hidden">
        <div className="text-xs tracking-[0.3em] text-primary uppercase mb-3">Bourbon Brothers</div>
        <h2 className="font-display text-3xl mb-3">Are you 21 or older?</h2>
        <p className="text-sm text-muted-foreground mb-6">
          You must be of legal drinking age in your country to enter this site.
        </p>
        {declined ? (
          <p className="text-sm text-muted-foreground mb-6">
            Sorry — you must be 21 or older to enter Bourbon Brothers.
          </p>
        ) : (
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={handleNo}>
              No
            </Button>
            <Button
              className="flex-1 bg-gradient-amber text-primary-foreground hover:opacity-90"
              onClick={() => {
                localStorage.setItem("bc_age_verified", "yes");
                setVerified(true);
              }}
            >
              Yes, enter
            </Button>
          </div>
        )}
        <p className="text-[10px] text-muted-foreground mt-6 leading-relaxed">
          Please drink responsibly. All transactions facilitated through licensed retailers in
          compliance with state and federal law.
        </p>
      </div>
    </div>
  );
}
