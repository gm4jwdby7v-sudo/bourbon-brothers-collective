import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SortSchema = z.enum(["asc", "desc"]);

const PresetInputSchema = z.object({
  name: z.string().min(1).max(100),
  state_filter: z.array(z.string().min(1).max(8)).max(60).default([]),
  retailer_search: z.string().max(200).default(""),
  retailer_sort: SortSchema.default("asc"),
  retailer_state_scope: z.string().min(1).max(16).default("all"),
  retailer_eligible_only: z.boolean().default(false),
});

export type RetailerPresetInput = z.infer<typeof PresetInputSchema>;

export interface RetailerPresetRow {
  id: string;
  name: string;
  state_filter: string[];
  retailer_search: string;
  retailer_sort: "asc" | "desc";
  retailer_state_scope: string;
  retailer_eligible_only: boolean;
}

export const listRetailerPresets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("retailer_presets")
      .select(
        "id, name, state_filter, retailer_search, retailer_sort, retailer_state_scope, retailer_eligible_only",
      )
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { presets: (data ?? []) as RetailerPresetRow[] };
  });

export const createRetailerPreset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => PresetInputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await context.supabase
      .from("retailer_presets")
      .insert({ ...data, user_id: context.userId })
      .select(
        "id, name, state_filter, retailer_search, retailer_sort, retailer_state_scope, retailer_eligible_only",
      )
      .single();
    if (error) throw new Error(error.message);
    return { preset: row as RetailerPresetRow };
  });

export const deleteRetailerPreset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("retailer_presets")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
