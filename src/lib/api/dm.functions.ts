import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const ThreadIdSchema = z.object({ threadId: z.string().uuid() });
const SendSchema = z.object({
  threadId: z.string().uuid(),
  body: z.string().trim().min(1).max(4000),
});

export const getThread = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ThreadIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: thread, error: threadErr } = await supabase
      .from("dm_threads")
      .select("id, created_at, updated_at")
      .eq("id", data.threadId)
      .maybeSingle();
    if (threadErr) throw new Error(threadErr.message);
    if (!thread) throw new Error("Thread not found");

    const { data: participants, error: pErr } = await supabase
      .from("dm_thread_participants")
      .select("user_id, last_read_at")
      .eq("thread_id", data.threadId);
    if (pErr) throw new Error(pErr.message);

    const { data: messages, error: mErr } = await supabase
      .from("dm_messages")
      .select("id, sender_id, body, created_at")
      .eq("thread_id", data.threadId)
      .order("created_at", { ascending: true });
    if (mErr) throw new Error(mErr.message);

    return {
      thread,
      participants: participants ?? [],
      messages: messages ?? [],
      viewerId: userId,
    };
  });

export const sendMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => SendSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: inserted, error } = await supabase
      .from("dm_messages")
      .insert({ thread_id: data.threadId, sender_id: userId, body: data.body })
      .select("id, sender_id, body, created_at")
      .single();
    if (error) throw new Error(error.message);
    return { message: inserted };
  });

export const markThreadRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => ThreadIdSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const now = new Date().toISOString();
    const { error } = await supabase
      .from("dm_thread_participants")
      .update({ last_read_at: now })
      .eq("thread_id", data.threadId)
      .eq("user_id", userId);
    if (error) throw new Error(error.message);
    return { last_read_at: now };
  });
