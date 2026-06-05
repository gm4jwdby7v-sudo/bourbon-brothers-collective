import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useServerFn } from "@tanstack/react-start";
import {
  enablePushNotifications,
  getPushStatus,
  type PushStatus,
} from "@/lib/push";
import { registerPushToken } from "@/lib/push.functions";

export const Route = createFileRoute("/_authenticated/_verified/messages/")({
  head: () => ({ meta: [{ title: "Messages — BourbonConnect" }] }),
  component: MessagesPage,
});

function MessagesPage() {
  const [status, setStatus] = useState<PushStatus>("default");
  const [busy, setBusy] = useState(false);
  const register = useServerFn(registerPushToken);

  useEffect(() => {
    getPushStatus().then(setStatus);
  }, []);

  const enable = async () => {
    setBusy(true);
    try {
      const token = await enablePushNotifications();
      const next = await getPushStatus();
      setStatus(next);
      if (!token) {
        if (next === "denied") {
          toast.error("Notifications blocked", {
            description: "Allow notifications in your browser settings.",
          });
        } else if (next === "unsupported") {
          toast.error("Push notifications aren't supported on this device.");
        } else {
          toast("Permission not granted yet.");
        }
        return;
      }
      await register({ data: { token } });
      toast.success("Push notifications enabled");
    } catch (e) {
      toast.error("Couldn't enable notifications", {
        description: e instanceof Error ? e.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <main
      className="max-w-3xl mx-auto px-6 py-12 space-y-6"
      data-testid="messages-root"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl">Messages</h1>
          <p className="text-muted-foreground text-sm">
            Send a direct message to another member.
          </p>
        </div>
        {status !== "unsupported" && (
          <Button
            variant="outline"
            size="sm"
            onClick={enable}
            disabled={busy || status === "granted"}
            data-testid="enable-push"
          >
            {status === "granted" ? (
              <>
                <Bell className="mr-2" size={14} /> Notifications on
              </>
            ) : (
              <>
                <BellOff className="mr-2" size={14} />
                {busy ? "Enabling…" : "Enable notifications"}
              </>
            )}
          </Button>
        )}
      </div>
      <div
        className="rounded-xl border border-border bg-card p-4 space-y-3"
        data-testid="messages-composer"
      >
        <Textarea
          data-testid="message-body"
          placeholder="Write a message…"
          rows={4}
        />
        <div className="flex justify-end">
          <Button
            data-testid="send-button"
            className="bg-gradient-amber text-primary-foreground"
          >
            Send
          </Button>
        </div>
      </div>
    </main>
  );
}
