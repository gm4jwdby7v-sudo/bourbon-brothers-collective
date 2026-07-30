import { createFileRoute } from "@tanstack/react-router";
import { AgeGate } from "@/components/AgeGate";
import { SiteNav } from "@/components/SiteNav";
import { Hero } from "@/components/Hero";
import { Features } from "@/components/Features";
import { Feed } from "@/components/Feed";
import { Exchange } from "@/components/Exchange";
import { Business } from "@/components/Business";
import { CTA, Footer } from "@/components/CTA";
import { VerifyEmailBanner } from "@/components/VerifyEmailGate";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Bourbon Brothers — The nationwide bourbon community" },
      {
        name: "description",
        content:
          "Connect with bourbon collectors, hunt rare releases, log pours, and trade with licensed retailers — all in one place.",
      },
      { property: "og:title", content: "Bourbon Brothers — The nationwide bourbon community" },
      {
        property: "og:description",
        content: "The premium community for bourbon enthusiasts, retailers, and distilleries.",
      },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen">
      <AgeGate />
      <SiteNav />
      <VerifyEmailBanner />
      <main>
        <Hero />
        <Features />
        <Feed />
        <Exchange />
        <Business />
        <CTA />
      </main>
      <Footer />
    </div>
  );
}
