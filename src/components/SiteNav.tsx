import { Link } from "@tanstack/react-router";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

const links = [
  { to: "/", label: "Community" },
  { to: "/", label: "Discover" },
  { to: "/", label: "Events" },
  { to: "/", label: "Exchange" },
  { to: "/", label: "Business" },
];

export function SiteNav() {
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 backdrop-blur-xl bg-background/70 border-b border-border">
      <div className="mx-auto max-w-7xl px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-md bg-gradient-amber shadow-glow flex items-center justify-center font-display text-primary-foreground font-bold">B</div>
          <span className="font-display text-lg tracking-tight">BourbonConnect</span>
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm text-muted-foreground">
          {links.map((l) => (
            <a key={l.label} href="#" className="hover:text-foreground transition-colors">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-3">
          <Button variant="ghost" size="sm">Sign in</Button>
          <Button size="sm" className="bg-gradient-amber text-primary-foreground hover:opacity-90">
            Join the pour
          </Button>
        </div>
        <button className="md:hidden" onClick={() => setOpen(!open)} aria-label="Menu">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-border bg-background/95 px-6 py-4 space-y-3">
          {links.map((l) => (
            <a key={l.label} href="#" className="block text-sm py-1">{l.label}</a>
          ))}
          <div className="pt-3 flex gap-2">
            <Button variant="outline" size="sm" className="flex-1">Sign in</Button>
            <Button size="sm" className="flex-1 bg-gradient-amber text-primary-foreground">Join</Button>
          </div>
        </div>
      )}
    </header>
  );
}
