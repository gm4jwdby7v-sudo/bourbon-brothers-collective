import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { SiteNav } from "@/components/SiteNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Check, MapPin, ShieldAlert, ShieldCheck, Store, X } from "lucide-react";

export const Route = createFileRoute("/marketplace")({
  head: () => ({
    meta: [
      { title: "Marketplace — BourbonConnect" },
      {
        name: "description",
        content:
          "Browse bourbon retailers, store picks, and rare releases. Filter by state compliance, retailer type, and bottle availability.",
      },
      { property: "og:title", content: "Marketplace — BourbonConnect" },
      {
        property: "og:description",
        content:
          "Licensed retailers, store picks, and rare drops — filter by state, retailer type, and availability.",
      },
    ],
  }),
  component: MarketplacePage,
});

// ─── Domain ────────────────────────────────────────────────────────────────

type RetailerType =
  | "liquor_store"
  | "online_retailer"
  | "auction_house"
  | "distillery_direct";

type Availability = "in_stock" | "allocated" | "waitlist" | "sold_out";

interface Listing {
  id: string;
  name: string;
  retailer: string;
  retailerType: RetailerType;
  /** ISO US state codes the retailer is licensed to ship to. */
  shipsTo: string[];
  basedIn: string;
  priceUsd: number;
  proof: number;
  availability: Availability;
}

const RETAILER_TYPE_LABEL: Record<RetailerType, string> = {
  liquor_store: "Liquor store",
  online_retailer: "Online retailer",
  auction_house: "Auction house",
  distillery_direct: "Distillery direct",
};

const AVAILABILITY_LABEL: Record<Availability, string> = {
  in_stock: "In stock",
  allocated: "Allocated",
  waitlist: "Waitlist",
  sold_out: "Sold out",
};

const AVAILABILITY_TONE: Record<Availability, string> = {
  in_stock: "bg-primary/15 text-primary border-primary/30",
  allocated: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  waitlist: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  sold_out: "bg-muted text-muted-foreground border-border",
};

// Common US states for the compliance filter. Kept short on purpose;
// real data would come from the listings/retailer license tables.
const STATES: { code: string; name: string }[] = [
  { code: "CA", name: "California" },
  { code: "FL", name: "Florida" },
  { code: "IL", name: "Illinois" },
  { code: "KY", name: "Kentucky" },
  { code: "NY", name: "New York" },
  { code: "TX", name: "Texas" },
  { code: "WA", name: "Washington" },
  { code: "TN", name: "Tennessee" },
];

const LISTINGS: Listing[] = [
  {
    id: "l-1",
    name: "Weller 12 Year",
    retailer: "Old Town Spirits",
    retailerType: "liquor_store",
    shipsTo: ["KY", "TN", "IL"],
    basedIn: "Louisville, KY",
    priceUsd: 189,
    proof: 90,
    availability: "allocated",
  },
  {
    id: "l-2",
    name: "Eagle Rare 10",
    retailer: "Bourbon Outpost",
    retailerType: "online_retailer",
    shipsTo: ["CA", "NY", "WA", "FL", "TX"],
    basedIn: "Sacramento, CA",
    priceUsd: 64,
    proof: 90,
    availability: "in_stock",
  },
  {
    id: "l-3",
    name: "Pappy Van Winkle 15",
    retailer: "Highline Auctions",
    retailerType: "auction_house",
    shipsTo: ["NY", "IL", "FL"],
    basedIn: "New York, NY",
    priceUsd: 2_400,
    proof: 107,
    availability: "waitlist",
  },
  {
    id: "l-4",
    name: "Buffalo Trace Single Barrel",
    retailer: "Buffalo Trace Distillery",
    retailerType: "distillery_direct",
    shipsTo: ["KY"],
    basedIn: "Frankfort, KY",
    priceUsd: 49,
    proof: 90,
    availability: "in_stock",
  },
  {
    id: "l-5",
    name: "Blanton's Gold",
    retailer: "Cellar 33",
    retailerType: "liquor_store",
    shipsTo: ["TX", "FL"],
    basedIn: "Austin, TX",
    priceUsd: 145,
    proof: 103,
    availability: "sold_out",
  },
  {
    id: "l-6",
    name: "Stagg Jr Batch 18",
    retailer: "Drams Online",
    retailerType: "online_retailer",
    shipsTo: ["WA", "CA", "NY"],
    basedIn: "Seattle, WA",
    priceUsd: 120,
    proof: 131,
    availability: "in_stock",
  },
  {
    id: "l-7",
    name: "George T. Stagg 2023",
    retailer: "Highline Auctions",
    retailerType: "auction_house",
    shipsTo: ["NY", "IL"],
    basedIn: "New York, NY",
    priceUsd: 1_100,
    proof: 135,
    availability: "waitlist",
  },
  {
    id: "l-8",
    name: "Four Roses Single Barrel OBSV",
    retailer: "Four Roses Distillery",
    retailerType: "distillery_direct",
    shipsTo: ["KY", "TN"],
    basedIn: "Lawrenceburg, KY",
    priceUsd: 79,
    proof: 100,
    availability: "allocated",
  },
];

// ─── Page ──────────────────────────────────────────────────────────────────

function MarketplacePage() {
  const [stateFilter, setStateFilter] = useState<string[]>([]);
  const [retailerFilter, setRetailerFilter] = useState<RetailerType[]>([]);
  const [availabilityFilter, setAvailabilityFilter] = useState<Availability[]>(
    [],
  );
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LISTINGS.filter((l) => {
      if (q && !`${l.name} ${l.retailer}`.toLowerCase().includes(q))
        return false;
      if (
        stateFilter.length > 0 &&
        !stateFilter.some((s) => l.shipsTo.includes(s))
      )
        return false;
      if (
        retailerFilter.length > 0 &&
        !retailerFilter.includes(l.retailerType)
      )
        return false;
      if (
        availabilityFilter.length > 0 &&
        !availabilityFilter.includes(l.availability)
      )
        return false;
      return true;
    });
  }, [query, stateFilter, retailerFilter, availabilityFilter]);

  const activeFilterCount =
    stateFilter.length + retailerFilter.length + availabilityFilter.length;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <SiteNav />
      <main className="mx-auto max-w-7xl px-6 py-10">
        <header className="mb-8">
          <h1 className="font-display text-4xl md:text-5xl tracking-tight">
            Marketplace
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            Licensed retailers, store picks, and rare drops. Filter by where a
            retailer ships, what kind of operation they run, and what's
            actually on the shelf right now.
          </p>
        </header>

        <div className="grid gap-8 lg:grid-cols-[280px_1fr]">
          <FiltersSidebar
            stateFilter={stateFilter}
            setStateFilter={setStateFilter}
            retailerFilter={retailerFilter}
            setRetailerFilter={setRetailerFilter}
            availabilityFilter={availabilityFilter}
            setAvailabilityFilter={setAvailabilityFilter}
            activeFilterCount={activeFilterCount}
            onClear={() => {
              setStateFilter([]);
              setRetailerFilter([]);
              setAvailabilityFilter([]);
            }}
          />

          <section>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search bottles or retailers"
                className="sm:max-w-xs"
                data-testid="marketplace-search"
              />
              <p
                className="text-sm text-muted-foreground"
                data-testid="marketplace-result-count"
              >
                {filtered.length} {filtered.length === 1 ? "result" : "results"}
              </p>
            </div>

            {filtered.length === 0 ? (
              <Card className="border-dashed">
                <CardContent className="py-12 text-center">
                  <p className="text-sm text-muted-foreground">
                    No listings match these filters. Try widening your state
                    compliance or availability selection.
                  </p>
                </CardContent>
              </Card>
            ) : (
              <ul
                className="grid gap-4 sm:grid-cols-2"
                data-testid="marketplace-results"
              >
                {filtered.map((l) => (
                  <li key={l.id}>
                    <ListingCard listing={l} />
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

// ─── Filters ──────────────────────────────────────────────────────────────

interface FiltersProps {
  stateFilter: string[];
  setStateFilter: (v: string[]) => void;
  retailerFilter: RetailerType[];
  setRetailerFilter: (v: RetailerType[]) => void;
  availabilityFilter: Availability[];
  setAvailabilityFilter: (v: Availability[]) => void;
  activeFilterCount: number;
  onClear: () => void;
}

function FiltersSidebar(props: FiltersProps) {
  const {
    stateFilter,
    setStateFilter,
    retailerFilter,
    setRetailerFilter,
    availabilityFilter,
    setAvailabilityFilter,
    activeFilterCount,
    onClear,
  } = props;

  const toggle = <T extends string>(arr: T[], v: T) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  return (
    <aside
      className="space-y-6 rounded-lg border border-border bg-card/40 p-5"
      data-testid="marketplace-filters"
    >
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg tracking-tight">Filters</h2>
        {activeFilterCount > 0 && (
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={onClear}
            data-testid="marketplace-clear-filters"
          >
            <X className="mr-1 h-3 w-3" /> Clear ({activeFilterCount})
          </Button>
        )}
      </div>

      <FilterGroup label="Ships to state">
        <div className="grid grid-cols-2 gap-2">
          {STATES.map((s) => {
            const checked = stateFilter.includes(s.code);
            return (
              <label
                key={s.code}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() =>
                    setStateFilter(toggle(stateFilter, s.code))
                  }
                  data-testid={`filter-state-${s.code}`}
                />
                <span>{s.code}</span>
              </label>
            );
          })}
        </div>
      </FilterGroup>

      <FilterGroup label="Retailer type">
        <div className="space-y-2">
          {(Object.keys(RETAILER_TYPE_LABEL) as RetailerType[]).map((t) => {
            const checked = retailerFilter.includes(t);
            return (
              <label
                key={t}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() =>
                    setRetailerFilter(toggle(retailerFilter, t))
                  }
                  data-testid={`filter-retailer-${t}`}
                />
                <span>{RETAILER_TYPE_LABEL[t]}</span>
              </label>
            );
          })}
        </div>
      </FilterGroup>

      <FilterGroup label="Bottle availability">
        <div className="space-y-2">
          {(Object.keys(AVAILABILITY_LABEL) as Availability[]).map((a) => {
            const checked = availabilityFilter.includes(a);
            return (
              <label
                key={a}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
              >
                <Checkbox
                  checked={checked}
                  onCheckedChange={() =>
                    setAvailabilityFilter(toggle(availabilityFilter, a))
                  }
                  data-testid={`filter-availability-${a}`}
                />
                <span>{AVAILABILITY_LABEL[a]}</span>
              </label>
            );
          })}
        </div>
      </FilterGroup>
    </aside>
  );
}

function FilterGroup({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

// ─── Listing card ─────────────────────────────────────────────────────────

function ListingCard({ listing }: { listing: Listing }) {
  return (
    <Card className="h-full border-border bg-card/60 transition-colors hover:border-primary/40">
      <CardContent className="flex h-full flex-col gap-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-display text-lg leading-tight">
              {listing.name}
            </h3>
            <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
              <Store className="h-3 w-3" /> {listing.retailer}
              <span className="opacity-60">·</span>
              {RETAILER_TYPE_LABEL[listing.retailerType]}
            </p>
          </div>
          <Badge
            variant="outline"
            className={AVAILABILITY_TONE[listing.availability]}
          >
            {AVAILABILITY_LABEL[listing.availability]}
          </Badge>
        </div>

        <p className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3" /> {listing.basedIn}
          <span className="opacity-60">·</span>
          Ships to {listing.shipsTo.join(", ")}
        </p>

        <div className="mt-auto flex items-end justify-between pt-2">
          <div>
            <p className="font-display text-xl">${listing.priceUsd.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">{listing.proof} proof</p>
          </div>
          <Button size="sm" variant="outline">
            View
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
