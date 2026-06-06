import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { SiteNav } from "@/components/SiteNav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Check,
  FileText,
  MapPin,
  Scale,
  ShieldAlert,
  ShieldCheck,
  Store,
  X,
} from "lucide-react";

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

type ComplianceStatus = "eligible" | "limited" | "not_eligible";

const COMPLIANCE_STATUS_LABEL: Record<ComplianceStatus, string> = {
  eligible: "Eligible",
  limited: "Limited",
  not_eligible: "Not eligible",
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

/**
 * Per-state shipping limitations applied at the destination. Real data would
 * come from a compliance service; these notes are representative summaries
 * for filter-aware UI and are NOT legal advice.
 */
interface StateLaw {
  /** Cap on a single shipment, in 750ml-equivalent bottles. null = no cap. */
  monthlyBottleLimit: number | null;
  /** True when the destination requires an adult signature on delivery. */
  adultSignatureRequired: boolean;
  /** True when the destination requires government-issued ID verification at delivery. */
  idRequired: boolean;
  /** Short legal note shown on the eligibility row. */
  note: string;
}

const STATE_LAW: Record<string, StateLaw> = {
  CA: {
    monthlyBottleLimit: null,
    adultSignatureRequired: true,
    idRequired: true,
    note: "Direct-to-consumer allowed via licensed retailer. Adult signature and valid government-issued ID required at delivery. Must be 21+.",
  },
  FL: {
    monthlyBottleLimit: 12,
    adultSignatureRequired: true,
    idRequired: true,
    note: "Limit 12 bottles per shipment. Adult signature and government-issued ID required. Must be 21+.",
  },
  IL: {
    monthlyBottleLimit: 9,
    adultSignatureRequired: true,
    idRequired: true,
    note: "Limit 9L per month per address. Retailer must hold an IL shipper's license. Adult signature and ID verification required. Must be 21+.",
  },
  KY: {
    monthlyBottleLimit: null,
    adultSignatureRequired: true,
    idRequired: true,
    note: "In-state shipments only from KY-licensed retailers. Adult signature and valid ID required at delivery. Must be 21+.",
  },
  NY: {
    monthlyBottleLimit: 36,
    adultSignatureRequired: true,
    idRequired: true,
    note: "Limit 36 bottles per year per address. Adult signature and government-issued ID required. Must be 21+.",
  },
  TX: {
    monthlyBottleLimit: 3,
    adultSignatureRequired: true,
    idRequired: true,
    note: "Limit 3 gallons per month per address. TX permit required. Adult signature and valid ID required. Must be 21+.",
  },
  WA: {
    monthlyBottleLimit: null,
    adultSignatureRequired: true,
    idRequired: true,
    note: "Direct-to-consumer allowed for licensed out-of-state retailers. Adult signature and ID verification required. Must be 21+.",
  },
  TN: {
    monthlyBottleLimit: 12,
    adultSignatureRequired: true,
    idRequired: true,
    note: "Limit 12 bottles per shipment. Retailer must hold a TN direct-shipper license. Adult signature and ID required. Must be 21+.",
  },
};

function getComplianceStatus(
  listing: Listing,
  stateCode: string,
): ComplianceStatus {
  if (!listing.shipsTo.includes(stateCode)) return "not_eligible";
  const law = STATE_LAW[stateCode];
  if (law?.monthlyBottleLimit != null) return "limited";
  return "eligible";
}

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
  const [complianceFilter, setComplianceFilter] = useState<ComplianceStatus[]>(
    [],
  );
  const [retailerNameFilter, setRetailerNameFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  // Unique retailer names (preserve first-seen order) + a representative listing
  // per retailer so the sidebar can show that retailer's per-state compliance.
  const retailerOptions = useMemo(() => {
    const seen = new Map<string, Listing>();
    for (const l of LISTINGS) if (!seen.has(l.retailer)) seen.set(l.retailer, l);
    return Array.from(seen.entries()).map(([name, listing]) => ({
      name,
      listing,
    }));
  }, []);

  const activeRetailerListing = useMemo(
    () =>
      retailerNameFilter === "all"
        ? null
        : (retailerOptions.find((r) => r.name === retailerNameFilter)?.listing ??
          null),
    [retailerNameFilter, retailerOptions],
  );



  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return LISTINGS.filter((l) => {
      if (retailerNameFilter !== "all" && l.retailer !== retailerNameFilter)
        return false;
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
      if (complianceFilter.length > 0) {
        const statesToCheck =
          stateFilter.length > 0 ? stateFilter : STATES.map((s) => s.code);
        const matches = statesToCheck.some((code) =>
          complianceFilter.includes(getComplianceStatus(l, code)),
        );
        if (!matches) return false;
      }
      return true;
    });
  }, [
    query,
    stateFilter,
    retailerFilter,
    availabilityFilter,
    complianceFilter,
    retailerNameFilter,
  ]);

  const activeFilterCount =
    stateFilter.length +
    retailerFilter.length +
    availabilityFilter.length +
    complianceFilter.length +
    (retailerNameFilter !== "all" ? 1 : 0);

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
            complianceFilter={complianceFilter}
            setComplianceFilter={setComplianceFilter}
            retailerNameFilter={retailerNameFilter}
            setRetailerNameFilter={setRetailerNameFilter}
            retailerOptions={retailerOptions}
            activeRetailerListing={activeRetailerListing}
            activeFilterCount={activeFilterCount}
            onClear={() => {
              setStateFilter([]);
              setRetailerFilter([]);
              setAvailabilityFilter([]);
              setComplianceFilter([]);
              setRetailerNameFilter("all");
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
                    <ListingCard listing={l} selectedStates={stateFilter} />
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
  complianceFilter: ComplianceStatus[];
  setComplianceFilter: (v: ComplianceStatus[]) => void;
  retailerNameFilter: string;
  setRetailerNameFilter: (v: string) => void;
  retailerOptions: { name: string; listing: Listing }[];
  activeRetailerListing: Listing | null;
  activeFilterCount: number;
  onClear: () => void;
}

const COMPLIANCE_TONE: Record<ComplianceStatus, string> = {
  eligible: "bg-emerald-500/20 text-emerald-300",
  limited: "bg-amber-500/20 text-amber-300",
  not_eligible: "bg-destructive/20 text-destructive",
};

function FiltersSidebar(props: FiltersProps) {
  const {
    stateFilter,
    setStateFilter,
    retailerFilter,
    setRetailerFilter,
    availabilityFilter,
    setAvailabilityFilter,
    complianceFilter,
    setComplianceFilter,
    retailerNameFilter,
    setRetailerNameFilter,
    retailerOptions,
    activeRetailerListing,
    activeFilterCount,
    onClear,
  } = props;

  const toggle = <T extends string>(arr: T[], v: T) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  // Per-state compliance for the currently-selected retailer (if any).
  const stateStatusForRetailer = useMemo(() => {
    if (!activeRetailerListing) return null;
    const map: Record<string, ComplianceStatus> = {};
    for (const s of STATES) {
      map[s.code] = getComplianceStatus(activeRetailerListing, s.code);
    }
    return map;
  }, [activeRetailerListing]);

  // Compliance counts (number of states matching each status) for the selected
  // retailer. When no retailer is chosen, shows nothing.
  const complianceCounts = useMemo(() => {
    if (!stateStatusForRetailer) return null;
    const counts: Record<ComplianceStatus, number> = {
      eligible: 0,
      limited: 0,
      not_eligible: 0,
    };
    for (const code of Object.keys(stateStatusForRetailer)) {
      counts[stateStatusForRetailer[code]]++;
    }
    return counts;
  }, [stateStatusForRetailer]);

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

      <FilterGroup label="Retailer">
        <Select
          value={retailerNameFilter}
          onValueChange={setRetailerNameFilter}
        >
          <SelectTrigger
            className="h-9 text-sm"
            data-testid="filter-retailer-name"
          >
            <SelectValue placeholder="All retailers" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All retailers</SelectItem>
            {retailerOptions.map((r) => (
              <SelectItem key={r.name} value={r.name}>
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {activeRetailerListing && (
          <p className="text-[11px] text-muted-foreground">
            Showing compliance for{" "}
            <span className="text-foreground">{activeRetailerListing.retailer}</span>
            .
          </p>
        )}
      </FilterGroup>

      <FilterGroup label="Ships to state">
        <div className="grid grid-cols-2 gap-2">
          {STATES.map((s) => {
            const checked = stateFilter.includes(s.code);
            const status = stateStatusForRetailer?.[s.code];
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
                <span className="flex items-center gap-1.5">
                  {s.code}
                  {status && (
                    <span
                      className={cn(
                        "rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none",
                        COMPLIANCE_TONE[status],
                      )}
                      title={COMPLIANCE_STATUS_LABEL[status]}
                    >
                      {status === "eligible"
                        ? "OK"
                        : status === "limited"
                          ? "LMT"
                          : "NO"}
                    </span>
                  )}
                </span>
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

      <FilterGroup label="Compliance status">
        <div className="space-y-2">
          {(Object.keys(COMPLIANCE_STATUS_LABEL) as ComplianceStatus[]).map(
            (c) => {
              const checked = complianceFilter.includes(c);
              const count = complianceCounts?.[c];
              return (
                <label
                  key={c}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
                >
                  <Checkbox
                    checked={checked}
                    onCheckedChange={() =>
                      setComplianceFilter(toggle(complianceFilter, c))
                    }
                    data-testid={`filter-compliance-${c}`}
                  />
                  <span className="flex items-center gap-1.5">
                    {COMPLIANCE_STATUS_LABEL[c]}
                    {count != null && (
                      <span
                        className={cn(
                          "rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none",
                          COMPLIANCE_TONE[c],
                        )}
                      >
                        {count}
                      </span>
                    )}
                  </span>
                </label>
              );
            },
          )}
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

function ListingCard({
  listing,
  selectedStates,
}: {
  listing: Listing;
  selectedStates: string[];
}) {
  const [open, setOpen] = useState(false);
  // When the user has selected states, surface per-state eligibility for
  // exactly those states. Otherwise show every state the retailer ships to.
  const eligibilityStates =
    selectedStates.length > 0 ? selectedStates : listing.shipsTo;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
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
          </p>

          <EligibilityPanel
            listing={listing}
            states={eligibilityStates}
            filtered={selectedStates.length > 0}
          />

          <div className="mt-auto flex items-end justify-between pt-2">
            <div>
              <p className="font-display text-xl">
                ${listing.priceUsd.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {listing.proof} proof
              </p>
            </div>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline">
                <Scale className="mr-1.5 h-3 w-3" />
                Legal
              </Button>
            </DialogTrigger>
          </div>
        </CardContent>
      </Card>

      <LegalDetailsModal
        listing={listing}
        states={eligibilityStates}
        selectedStates={selectedStates}
        filtered={selectedStates.length > 0}
      />
    </Dialog>
  );
}

function EligibilityPanel({
  listing,
  states,
  filtered,
}: {
  listing: Listing;
  states: string[];
  filtered: boolean;
}) {
  return (
    <div
      className="rounded-md border border-border/60 bg-background/40 p-3"
      data-testid={`eligibility-${listing.id}`}
    >
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <ShieldCheck className="h-3 w-3" />
        {filtered ? "Eligibility for selected states" : "Ships to"}
      </p>
      <ul className="space-y-1.5">
        {states.map((code) => {
          const allowed = listing.shipsTo.includes(code);
          const law = STATE_LAW[code];
          return (
            <li
              key={code}
              className="flex items-start gap-2 text-xs"
              data-testid={`eligibility-${listing.id}-${code}`}
            >
              {allowed ? (
                <Check
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary"
                  aria-label="Eligible"
                />
              ) : (
                <X
                  className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive"
                  aria-label="Not eligible"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-medium text-foreground">{code}</span>
                  {allowed ? (
                    law?.monthlyBottleLimit != null ? (
                      <Badge
                        variant="outline"
                        className="h-4 border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] text-amber-300"
                      >
                        Limit {law.monthlyBottleLimit} btl
                      </Badge>
                    ) : null
                  ) : (
                    <Badge
                      variant="outline"
                      className="h-4 border-destructive/40 bg-destructive/10 px-1.5 text-[10px] text-destructive"
                    >
                      Not licensed
                    </Badge>
                  )}
                  {allowed && law?.adultSignatureRequired && (
                    <Badge
                      variant="outline"
                      className="h-4 border-border bg-muted px-1.5 text-[10px] text-muted-foreground"
                    >
                      Adult signature
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                  {allowed
                    ? (law?.note ??
                      "Direct-to-consumer shipping allowed by retailer.")
                    : `${listing.retailer} is not licensed to ship to ${code}.`}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
      {filtered && (
        <p className="mt-2 flex items-start gap-1 text-[10px] leading-snug text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" />
          Compliance details are summaries, not legal advice. Confirm at
          checkout.
        </p>
      )}
    </div>
  );
}

// ─── Legal details modal ───────────────────────────────────────────────────

function LegalDetailsModal({
  listing,
  states,
  selectedStates,
  filtered,
}: {
  listing: Listing;
  states: string[];
  selectedStates: string[];
  filtered: boolean;
}) {
  const [activeState, setActiveState] = useState(states[0] ?? "");
  const [showNotes, setShowNotes] = useState(true);

  // Sync activeState to the filter state(s) whenever the dialog content mounts
  // or the underlying state list changes. Prefer the first selected filter state
  // that the retailer ships to; fall back to the first selected state; finally
  // fall back to the first eligible state.
  const defaultActive = useMemo(() => {
    if (selectedStates.length > 0) {
      const firstShipped = selectedStates.find((s) =>
        listing.shipsTo.includes(s),
      );
      return firstShipped ?? selectedStates[0] ?? states[0] ?? "";
    }
    return states[0] ?? "";
  }, [selectedStates, states, listing.shipsTo]);

  useEffect(() => {
    setActiveState(defaultActive);
  }, [defaultActive]);

  // If the states list changes (e.g. filter applied), ensure activeState is valid
  const validActive = states.includes(activeState)
    ? activeState
    : defaultActive;

  const activeLaw = STATE_LAW[validActive];
  const activeAllowed = listing.shipsTo.includes(validActive);
  const activeStateName =
    STATES.find((s) => s.code === validActive)?.name ?? validActive;

  return (
    <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Scale className="h-5 w-5 text-primary" />
          Legal limitations
        </DialogTitle>
        <DialogDescription>
          Shipping compliance, limits, and ID requirements for{" "}
          {listing.retailer}
          {filtered
            ? " in your selected states"
            : " in every state they ship to"}
          .
        </DialogDescription>
      </DialogHeader>

      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">Show disclaimers &amp; notes</span>
        <Switch
          checked={showNotes}
          onCheckedChange={setShowNotes}
          aria-label="Toggle disclaimers and notes"
        />
      </div>

      {/* State selector */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {states.map((code) => {
          const isActive = code === validActive;
          const allowed = listing.shipsTo.includes(code);
          const law = STATE_LAW[code];
          const status = allowed
            ? law?.monthlyBottleLimit != null
              ? "Limited"
              : "Eligible"
            : "Not eligible";
          const statusTone = allowed
            ? law?.monthlyBottleLimit != null
              ? "bg-amber-500/20 text-amber-300"
              : "bg-emerald-500/20 text-emerald-300"
            : "bg-destructive/20 text-destructive";
          return (
            <button
              key={code}
              onClick={() => setActiveState(code)}
              className={cn(
                "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                isActive
                  ? "border-primary bg-primary text-primary-foreground"
                  : allowed
                    ? "border-border bg-muted text-muted-foreground hover:text-foreground"
                    : "border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20",
              )}
            >
              {code}
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[9px] font-semibold leading-none",
                  isActive ? "bg-primary-foreground/20 text-primary-foreground" : statusTone,
                )}
              >
                {status}
              </span>
            </button>
          );
        })}
      </div>

      {/* Selected state detail */}
      <div className="rounded-lg border border-border/60 bg-background/40 p-4">
        <div className="flex items-center gap-2">
          {activeAllowed ? (
            <Check className="h-5 w-5 shrink-0 text-primary" />
          ) : (
            <X className="h-5 w-5 shrink-0 text-destructive" />
          )}
          <h4 className="text-base font-semibold">
            {activeStateName} ({validActive})
          </h4>
          {!activeAllowed && (
            <Badge
              variant="outline"
              className="border-destructive/40 bg-destructive/10 text-destructive"
            >
              Not licensed
            </Badge>
          )}
        </div>

        {activeAllowed && activeLaw && (
          <div className="mt-3 space-y-3">
            <div className="flex flex-wrap gap-2">
              {activeLaw.monthlyBottleLimit != null ? (
                <Badge
                  variant="outline"
                  className="border-amber-500/30 bg-amber-500/10 text-amber-300"
                >
                  Limit {activeLaw.monthlyBottleLimit} btl
                </Badge>
              ) : (
                <Badge
                  variant="outline"
                  className="border-primary/30 bg-primary/10 text-primary"
                >
                  No bottle limit
                </Badge>
              )}
              {activeLaw.adultSignatureRequired && (
                <Badge
                  variant="outline"
                  className="border-border bg-muted text-muted-foreground"
                >
                  Adult signature required
                </Badge>
              )}
              {activeLaw.idRequired && (
                <Badge
                  variant="outline"
                  className="border-border bg-muted text-muted-foreground"
                >
                  Government-issued ID required
                </Badge>
              )}
            </div>
            {showNotes && (
              <p className="text-sm leading-relaxed text-muted-foreground">
                {activeLaw.note}
              </p>
            )}
          </div>
        )}

        {!activeAllowed && (
          <p className="mt-3 text-sm text-muted-foreground">
            {listing.retailer} is not licensed to ship to {validActive}.
          </p>
        )}
      </div>

      {/* Full reference list */}
      <ScrollArea className="-mr-4 flex-1 pr-4">
        <p className="mb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          All states
        </p>
        <div className="space-y-3">
          {states.map((code, idx) => {
            const allowed = listing.shipsTo.includes(code);
            const law = STATE_LAW[code];
            const stateName =
              STATES.find((s) => s.code === code)?.name ?? code;
            return (
              <div key={code} className="space-y-1.5">
                <div className="flex items-center gap-2">
                  {allowed ? (
                    <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
                  ) : (
                    <X className="h-3.5 w-3.5 shrink-0 text-destructive" />
                  )}
                  <span className="text-sm font-medium">
                    {stateName} ({code})
                  </span>
                  {!allowed && (
                    <Badge
                      variant="outline"
                      className="h-4 border-destructive/40 bg-destructive/10 text-[10px] text-destructive"
                    >
                      Not licensed
                    </Badge>
                  )}
                </div>
                {showNotes && allowed && law && (
                  <p className="ml-5 text-xs text-muted-foreground">
                    {law.note}
                  </p>
                )}
                {!allowed && (
                  <p className="ml-5 text-xs text-muted-foreground">
                    {listing.retailer} is not licensed to ship to {code}.
                  </p>
                )}
                {idx < states.length - 1 && <Separator />}
              </div>
            );
          })}
        </div>
      </ScrollArea>

      {showNotes && (
        <div className="mt-2 flex items-start gap-2 rounded-md border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground">
          <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            These details are summaries for convenience and are NOT legal advice.
            Alcohol shipping laws change frequently. Confirm all requirements
            directly with the retailer and consult local regulations before
            ordering.
          </p>
        </div>
      )}
    </DialogContent>
  );
}

