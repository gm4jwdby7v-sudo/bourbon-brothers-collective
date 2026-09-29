// @vitest-environment node
/**
 * Live integration tests for row-level security and storage ownership rules.
 *
 * Anonymous checks always run against the real backend.
 * Signed-in checks need two dedicated test accounts, supplied via env:
 *   RLS_TEST_USER_A_EMAIL / RLS_TEST_USER_A_PASSWORD
 *   RLS_TEST_USER_B_EMAIL / RLS_TEST_USER_B_PASSWORD
 * They are skipped when those variables are missing.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const BUCKET = "review-images";

const env = process.env;
const hasUsers = Boolean(
  env.RLS_TEST_USER_A_EMAIL &&
    env.RLS_TEST_USER_A_PASSWORD &&
    env.RLS_TEST_USER_B_EMAIL &&
    env.RLS_TEST_USER_B_PASSWORD,
);
const hasBackend = Boolean(URL && KEY);

function client() {
  return createClient(URL, KEY, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function signIn(email: string, password: string) {
  const c = client();
  const { data, error } = await c.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Sign-in failed for test user: ${error?.message}`);
  return { c, id: data.user.id };
}

describe.skipIf(!hasBackend)("RLS: anonymous visitor", () => {
  const anon = client();

  it("cannot read anyone's follows", async () => {
    const { data } = await anon.from("place_follows").select("user_id, place_id");
    expect(data ?? []).toHaveLength(0);
  });

  it("can read aggregate follower counts only", async () => {
    const { data, error } = await anon.rpc("place_follower_counts");
    expect(error).toBeNull();
    for (const row of data ?? []) {
      expect(Object.keys(row).sort()).toEqual(["follower_count", "place_id"]);
    }
  });

  it("cannot read profiles", async () => {
    const { data } = await anon.from("profiles").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("cannot read moderation metadata on reviews", async () => {
    const { error } = await anon.from("bourbon_reviews").select("image_moderation_reason").limit(1);
    expect(error).not.toBeNull();
  });

  it("cannot list or download review images", async () => {
    const { data } = await anon.storage.from(BUCKET).list("", { limit: 5 });
    expect(data ?? []).toHaveLength(0);
  });

  it("cannot upload review images", async () => {
    const { error } = await anon.storage
      .from(BUCKET)
      .upload(`anon-${Date.now()}.txt`, new Blob(["x"]), { contentType: "text/plain" });
    expect(error).not.toBeNull();
  });

  it("cannot create notifications or change roles", async () => {
    const n = await anon.from("notifications").insert({ user_id: crypto.randomUUID(), type: "t", title: "t" });
    expect(n.error).not.toBeNull();
    const r = await anon.from("user_roles").insert({ user_id: crypto.randomUUID(), role: "admin" });
    expect(r.error).not.toBeNull();
  });
});

describe.skipIf(!hasBackend || !hasUsers)("RLS: signed-in members", () => {
  let a: { c: SupabaseClient; id: string };
  let b: { c: SupabaseClient; id: string };
  let placeId: string | null = null;
  const filePath = () => `${a.id}/rls-test-${Date.now()}.txt`;
  let uploaded: string | null = null;

  beforeAll(async () => {
    a = await signIn(env.RLS_TEST_USER_A_EMAIL!, env.RLS_TEST_USER_A_PASSWORD!);
    b = await signIn(env.RLS_TEST_USER_B_EMAIL!, env.RLS_TEST_USER_B_PASSWORD!);
    const { data } = await a.c.from("places").select("id").limit(1);
    placeId = data?.[0]?.id ?? null;
  });

  afterAll(async () => {
    if (placeId) await a.c.from("place_follows").delete().eq("user_id", a.id).eq("place_id", placeId);
    if (uploaded) await a.c.storage.from(BUCKET).remove([uploaded]);
    await a?.c.auth.signOut();
    await b?.c.auth.signOut();
  });

  it("owner sees their own follow; other member cannot", async () => {
    if (!placeId) return;
    await a.c.from("place_follows").upsert({ user_id: a.id, place_id: placeId });
    const own = await a.c.from("place_follows").select("place_id").eq("user_id", a.id);
    expect(own.data?.map((r) => r.place_id)).toContain(placeId);
    const other = await b.c.from("place_follows").select("user_id").eq("user_id", a.id);
    expect(other.data ?? []).toHaveLength(0);
  });

  it("member cannot follow on behalf of someone else", async () => {
    if (!placeId) return;
    const { error } = await b.c.from("place_follows").insert({ user_id: a.id, place_id: placeId });
    expect(error).not.toBeNull();
  });

  it("member cannot grant themselves a role", async () => {
    const { error } = await b.c.from("user_roles").insert({ user_id: b.id, role: "admin" });
    expect(error).not.toBeNull();
  });

  it("member cannot write a review as someone else", async () => {
    const { error } = await b.c
      .from("bourbon_reviews")
      .insert({ user_id: a.id, bottle_name: "RLS test", rating: 3, body: "x" });
    expect(error).not.toBeNull();
  });

  it("member cannot read another member's notification prefs or presets", async () => {
    const p = await b.c.from("notification_preferences").select("user_id").eq("user_id", a.id);
    expect(p.data ?? []).toHaveLength(0);
    const r = await b.c.from("retailer_presets").select("id").eq("user_id", a.id);
    expect(r.data ?? []).toHaveLength(0);
  });

  it("storage: owner uploads to own folder; others can view but not modify", async () => {
    const path = filePath();
    const up = await a.c.storage.from(BUCKET).upload(path, new Blob(["hello"]), { contentType: "text/plain" });
    expect(up.error).toBeNull();
    uploaded = path;

    const read = await b.c.storage.from(BUCKET).download(path);
    expect(read.error).toBeNull();

    const overwrite = await b.c.storage
      .from(BUCKET)
      .upload(path, new Blob(["evil"]), { upsert: true, contentType: "text/plain" });
    expect(overwrite.error).not.toBeNull();

    await b.c.storage.from(BUCKET).remove([path]);
    const still = await a.c.storage.from(BUCKET).download(path);
    expect(still.error).toBeNull();
    expect(await still.data!.text()).toBe("hello");
  });

  it("storage: member cannot upload into another member's folder", async () => {
    const { error } = await b.c.storage
      .from(BUCKET)
      .upload(`${a.id}/intruder-${Date.now()}.txt`, new Blob(["x"]), { contentType: "text/plain" });
    expect(error).not.toBeNull();
  });
});
