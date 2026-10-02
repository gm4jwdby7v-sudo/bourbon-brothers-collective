import { createFileRoute } from "@tanstack/react-router";
import { SiteNav } from "@/components/SiteNav";
import { BottomTabBar } from "@/components/BottomTabBar";
import { Business } from "@/components/Business";
import { Footer } from "@/components/CTA";
import { VerifyEmailBanner } from "@/components/VerifyEmailGate";

export const Route = createFileRoute("/business")({
  head: () => ({
    meta: [
      { title: "For Business · Bourbon Brothers" },
      {
        name: "description",
        content:
          "Retailers, distilleries, and event organizers — reach the most engaged drinkers in America.",
      },
      { property: "og:title", content: "For Business · Bourbon Brothers" },
      {
        property: "og:description",
        content:
          "Storefront listings, brand hubs, and event promotion for the bourbon trade.",
      },
    ],
  }),
  component: BusinessPage,
});

function BusinessPage() {
  return (
    <div className="min-h-screen">
      <SiteNav />
      <BottomTabBar />
      <VerifyEmailBanner />
      <main>
        <Business />
      </main>
      <Footer />
    </div>
  );
}
