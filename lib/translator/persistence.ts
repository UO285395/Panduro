"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type SaveTranslationInput = {
  text: string;
  cardIds: string[];
  startedAt: number; // epoch ms
  endedAt: number;
};

export type TranslationRow = {
  id: string | number;
  text: string;
  cardIds: string[];
  startedAt: number;
  endedAt: number;
  createdAt: number;
};

export async function saveTranslation(input: SaveTranslationInput) {
  if (!input.text.trim()) return null;
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data } = await supabase
    .from("translations")
    .insert({
      user_id: user.id,
      text: input.text,
      card_ids: input.cardIds,
      started_at: new Date(input.startedAt).toISOString(),
      ended_at: new Date(input.endedAt).toISOString(),
    })
    .select("id, text, card_ids, started_at, ended_at, created_at")
    .single();

  revalidatePath("/translate");
  if (!data) return null;
  return {
    id: data.id,
    text: data.text,
    cardIds: Array.isArray(data.card_ids) ? (data.card_ids as string[]) : [],
    startedAt: new Date(data.started_at).getTime(),
    endedAt: new Date(data.ended_at).getTime(),
    createdAt: new Date(data.created_at).getTime(),
  } satisfies TranslationRow;
}

export async function listTranslations(limit = 20): Promise<TranslationRow[]> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase
    .from("translations")
    .select("id, text, card_ids, started_at, ended_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []).map((d) => ({
    id: d.id,
    text: d.text,
    cardIds: Array.isArray(d.card_ids) ? (d.card_ids as string[]) : [],
    startedAt: new Date(d.started_at).getTime(),
    endedAt: new Date(d.ended_at).getTime(),
    createdAt: new Date(d.created_at).getTime(),
  }));
}
