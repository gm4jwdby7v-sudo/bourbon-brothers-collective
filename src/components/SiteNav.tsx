import { Link } from "@tanstack/react-router";
import { Menu, X, LogOut, User as UserIcon } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const links = [
  { to: "/", label: "Community" },
  { to: "/forum/new", label: "New post" },
  { to: "/messages", label: "Messages" },
  { to: "/events/featured/checkout", label: "Events" },
] as const;

export function SiteNav() {
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();

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
          {user ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <div className="h-7 w-7 rounded-full bg-gradient-amber flex items-center justify-center text-primary-foreground text-xs font-bold">
                    {(user.email ?? "?")[0].toUpperCase()}
                  </div>
                  <span className="max-w-[140px] truncate">{user.email}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem>
                  <UserIcon className="mr-2 h-4 w-4" /> Profile
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut className="mr-2 h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <>
              <Link to="/auth"><Button variant="ghost" size="sm">Sign in</Button></Link>
              <Link to="/auth">
                <Button size="sm" className="bg-gradient-amber text-primary-foreground hover:opacity-90">
                  Join the pour
                </Button>
              </Link>
            </>
          )}
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
            {user ? (
              <Button variant="outline" size="sm" className="flex-1" onClick={() => signOut()}>
                Sign out
              </Button>
            ) : (
              <>
                <Link to="/auth" className="flex-1"><Button variant="outline" size="sm" className="w-full">Sign in</Button></Link>
                <Link to="/auth" className="flex-1"><Button size="sm" className="w-full bg-gradient-amber text-primary-foreground">Join</Button></Link>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
