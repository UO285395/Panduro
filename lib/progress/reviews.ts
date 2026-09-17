"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  initialReview,
  nextReview,
  type Quality,
  type ReviewState,
} from "@/lib/srs/sm2";

export type SubmitReviewInput = {
  cardId: string;
  quality: Quality;
};

export async function submitReview(input: SubmitReviewInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const now = Date.now();
  const { data: existing } = await supabase
    .from("reviews")
    .select("ease, interval_days, repetitions, due_at")
    .eq("user_id", user.id)
    .eq("card_id", input.cardId)
    .maybeSingle();

  const current: ReviewState = existing
    ? {
        ease: Number(existing.ease),
        intervalDays: existing.interval_days,
        repetitions: existing.repetitions,
        dueAt: new Date(existing.due_at).getTime(),
      }
    : initialReview(now);

  const state = nextReview(current, input.quality, now);

  await supabase.from("reviews").upsert(
    {
      user_id: user.id,
      card_id: input.cardId,
      ease: state.ease,
      interval_days: state.intervalDays,
      repetitions: state.repetitions,
      due_at: new Date(state.dueAt).toISOString(),
      updated_at: new Date(now).toISOString(),
    },
    { onConflict: "user_id,card_id" },
  );

  // Mantén la racha viva.
  const today = new Date(now).toISOString().slice(0, 10);
  const { data: profile } = await supabase
    .from("profiles")
    .select("streak_days, streak_last_day")
    .eq("id", user.id)
    .maybeSingle();
  if (profile?.streak_last_day !== today) {
    await supabase
      .from("profiles")
      .update({
        streak_days: (profile?.streak_days ?? 0) + 1,
        streak_last_day: today,
      })
      .eq("id", user.id);
  }

  await supabase.from("events").insert({
    user_id: user.id,
    kind: "review_submitted",
    payload: {
      card_id: input.cardId,
      quality: input.quality,
      interval_days: state.intervalDays,
      ease: state.ease,
    },
  });

  revalidatePath("/review");
  revalidatePath("/dashboard");
  return state;
}
