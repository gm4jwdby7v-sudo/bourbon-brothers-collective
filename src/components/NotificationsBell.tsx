import { useEffect, useState, useCallback } from "react";
import { Bell, Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

interface NotificationRow {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

function timeAgo(iso: string) {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

export function NotificationsBell() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const unread = items.filter((n) => !n.read_at).length;

  const load = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, body, link, read_at, created_at")
      .order("created_at", { ascending: false })
      .limit(20);
    setItems((data ?? []) as NotificationRow[]);
  }, [user]);

  useEffect(() => {
    void load();
    if (!user) return;
    const channel = supabase
      .channel(`notifs-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, load]);

  async function markAllRead() {
    if (!user || unread === 0) return;
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    await supabase.from("notifications").update({ read_at: now }).is("read_at", null);
  }

  async function markOneRead(id: string) {
    const now = new Date().toISOString();
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: now } : n)));
    await supabase.from("notifications").update({ read_at: now }).eq("id", id);
  }

  if (!user) return null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
          <Bell className="h-5 w-5" />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <span className="text-sm font-medium">Notifications</span>
          {unread > 0 && (
            <button
              onClick={() => void markAllRead()}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <Check className="h-3 w-3" /> Mark all read
            </button>
          )}
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <li className="px-3 py-8 text-center text-xs text-muted-foreground">
              You're all caught up.
            </li>
          ) : (
            items.map((n) => {
              const content = (
                <div
                  className={cn(
                    "block px-3 py-2.5 hover:bg-muted/40 transition-colors",
                    !n.read_at && "bg-primary/5",
                  )}
                >
                  <div className="flex items-start gap-2">
                    {!n.read_at && (
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium leading-snug">{n.title}</p>
                      {n.body && (
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {n.body}
                        </p>
                      )}
                      <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                        {timeAgo(n.created_at)}
                      </p>
                    </div>
                  </div>
                </div>
              );
              return (
                <li key={n.id} className="border-b border-border/40 last:border-0">
                  {n.link ? (
                    <Link
                      to={n.link}
                      onClick={() => void markOneRead(n.id)}
                      className="block"
                    >
                      {content}
                    </Link>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void markOneRead(n.id)}
                      className="block w-full text-left"
                    >
                      {content}
                    </button>
                  )}
                </li>
              );
            })
          )}
        </ul>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
