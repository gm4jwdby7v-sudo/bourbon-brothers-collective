import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Bell, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { DEFAULT_PREFS, isInQuietHours, type NotificationPrefs } from "@/lib/notification-prefs";

export const Route = createFileRoute("/_authenticated/_verified/settings/notifications")({
  head: () => ({ meta: [{ title: "Notification settings — Bourbon Brothers" }] }),
  component: NotificationSettingsPage,
});

// Common IANA zones – good enough for most users.
const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Anchorage",
  "America/Toronto",
  "America/Mexico_City",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Athens",
  "Europe/Moscow",
  "Africa/Johannesburg",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Pacific/Auckland",
];

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

function NotificationSettingsPage() {
  const { user } = useAuth();
  const viewerId = user?.id;

  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!viewerId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("notification_preferences")
        .select(
          "dm_push_enabled, dm_inapp_enabled, quiet_hours_enabled, quiet_start, quiet_end, timezone",
        )
        .eq("user_id", viewerId)
        .maybeSingle();
      if (cancelled) return;
      setPrefs({
        ...DEFAULT_PREFS,
        timezone: detectTimezone(),
        ...(data ?? {}),
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [viewerId]);

  const inQuiet = useMemo(() => isInQuietHours(prefs), [prefs]);

  const update = <K extends keyof NotificationPrefs>(key: K, value: NotificationPrefs[K]) =>
    setPrefs((p) => ({ ...p, [key]: value }));

  const save = async () => {
    if (!viewerId) return;
    setSaving(true);
    try {
      const { error } = await supabase.from("notification_preferences").upsert(
        {
          user_id: viewerId,
          ...prefs,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw new Error(error.message);
      toast.success("Notification settings saved");
    } catch (e) {
      toast.error("Couldn't save", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setSaving(false);
    }
  };

  if (!viewerId || loading) {
    return (
      <main className="max-w-2xl mx-auto px-6 py-12" data-testid="notif-settings-loading">
        Loading settings…
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-12 space-y-8" data-testid="notif-settings-root">
      <header className="space-y-2">
        <h1 className="font-display text-3xl">Notifications</h1>
        <p className="text-sm text-muted-foreground">
          Choose how you want to be alerted about new direct messages.{" "}
          <Link to="/messages" className="underline">
            Back to messages
          </Link>
        </p>
      </header>

      <section className="rounded-xl border border-border bg-card p-5 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label className="text-base flex items-center gap-2">
              <Bell size={16} /> Push notifications
            </Label>
            <p className="text-sm text-muted-foreground">
              Get a notification on this device even when the app isn't open.
            </p>
          </div>
          <Switch
            data-testid="toggle-dm-push"
            checked={prefs.dm_push_enabled}
            onCheckedChange={(v) => update("dm_push_enabled", v)}
          />
        </div>
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label className="text-base">In-app alerts</Label>
            <p className="text-sm text-muted-foreground">
              Show a toast inside the app when a new message arrives.
            </p>
          </div>
          <Switch
            data-testid="toggle-dm-inapp"
            checked={prefs.dm_inapp_enabled}
            onCheckedChange={(v) => update("dm_inapp_enabled", v)}
          />
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <Label className="text-base flex items-center gap-2">
              <Moon size={16} /> Quiet hours
            </Label>
            <p className="text-sm text-muted-foreground">
              Silence all DM alerts within a daily window.
            </p>
          </div>
          <Switch
            data-testid="toggle-quiet"
            checked={prefs.quiet_hours_enabled}
            onCheckedChange={(v) => update("quiet_hours_enabled", v)}
          />
        </div>

        {prefs.quiet_hours_enabled && (
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label htmlFor="quiet-start">Start</Label>
              <Input
                id="quiet-start"
                data-testid="quiet-start"
                type="time"
                value={prefs.quiet_start}
                onChange={(e) => update("quiet_start", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="quiet-end">End</Label>
              <Input
                id="quiet-end"
                data-testid="quiet-end"
                type="time"
                value={prefs.quiet_end}
                onChange={(e) => update("quiet_end", e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>Time zone</Label>
              <Select value={prefs.timezone} onValueChange={(v) => update("timezone", v)}>
                <SelectTrigger data-testid="quiet-tz">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from(new Set([prefs.timezone, detectTimezone(), ...TIMEZONES])).map(
                    (tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            </div>
            <p className="sm:col-span-3 text-xs text-muted-foreground" data-testid="quiet-status">
              {inQuiet
                ? "You're currently in quiet hours — alerts are paused."
                : "Outside quiet hours — alerts will arrive normally."}
            </p>
          </div>
        )}
      </section>

      <div className="flex justify-end">
        <Button
          data-testid="save-settings"
          onClick={save}
          disabled={saving}
          className="bg-gradient-amber text-primary-foreground"
        >
          {saving ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </main>
  );
}
