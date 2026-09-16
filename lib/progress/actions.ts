"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeLessonScore, MAX_HEARTS } from "@/lib/gamification/xp";
import { onHeartsLost } from "@/lib/gamification/lazy";
import { initialReview } from "@/lib/srs/sm2";
import { cardIdsForLesson } from "@/lib/srs/scheduler";
import { getLesson } from "@/lib/curriculum/loader";

type CompleteLessonInput = {
  lessonId: string;
  correct: number;
  total: number;
  heartsUsed: number;
};

export async function completeLesson(input: CompleteLessonInput) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const now = Date.now();
  const { data: profile } = await supabase
    .from("profiles")
    .select("hearts, hearts_regen_at, xp_total, streak_days, streak_last_day")
    .eq("id", user.id)
    .single();

  const heartsBefore = profile?.hearts ?? MAX_HEARTS;
  const heartsAfter = Math.max(0, heartsBefore - input.heartsUsed);
  const heartsRegenAt = onHeartsLost(
    heartsBefore,
    heartsAfter,
    profile?.hearts_regen_at ? new Date(profile.hearts_regen_at).getTime() : null,
    now,
  );

  const { xp, bestScore, perfected } = computeLessonScore({
    correct: input.correct,
    total: input.total,
    heartsRemaining: heartsAfter,
  });

  const { data: existing } = await supabase
    .from("progress")
    .select("best_score, attempts")
    .eq("user_id", user.id)
    .eq("lesson_id", input.lessonId)
    .maybeSingle();

  const attempts = (existing?.attempts ?? 0) + 1;
  const newBest = Math.max(existing?.best_score ?? 0, bestScore);
  const status = perfected ? "perfected" : "completed";

  await supabase.from("progress").upsert(
    {
      user_id: user.id,
      lesson_id: input.lessonId,
      status,
      best_score: newBest,
      attempts,
      completed_at: new Date(now).toISOString(),
      updated_at: new Date(now).toISOString(),
    },
    { onConflict: "user_id,lesson_id" },
  );

  const today = new Date(now).toISOString().slice(0, 10);
  const streakDays =
    profile?.streak_last_day === today
      ? (profile?.streak_days ?? 0) || 1
      : (profile?.streak_days ?? 0) + 1;

  await supabase
    .from("profiles")
    .update({
      hearts: heartsAfter,
      hearts_regen_at: heartsRegenAt ? new Date(heartsRegenAt).toISOString() : null,
      xp_total: (profile?.xp_total ?? 0) + xp,
      streak_days: streakDays,
      streak_last_day: today,
    })
    .eq("id", user.id);

  // Inicializa reviews SM-2 para las cards de esta lección si aún no existen.
  const lesson = getLesson(input.lessonId);
  if (lesson) {
    const cardIds = cardIdsForLesson(lesson);
    if (cardIds.length > 0) {
      const initial = initialReview(now);
      const rows = cardIds.map((cardId) => ({
        user_id: user.id,
        card_id: cardId,
        ease: initial.ease,
        interval_days: initial.intervalDays,
        repetitions: initial.repetitions,
        due_at: new Date(initial.dueAt).toISOString(),
        updated_at: new Date(now).toISOString(),
      }));
      // ignoreDuplicates simula "insert si no existe"; los ya presentes no se tocan.
      await supabase
        .from("reviews")
        .upsert(rows, { onConflict: "user_id,card_id", ignoreDuplicates: true });
    }
  }

  await supabase.from("events").insert({
    user_id: user.id,
    kind: "lesson_completed",
    payload: {
      lesson_id: input.lessonId,
      correct: input.correct,
      total: input.total,
      hearts_used: input.heartsUsed,
      xp_awarded: xp,
      perfected,
    },
  });

  revalidatePath("/dashboard");
  return { xp, bestScore, perfected, heartsAfter };
}
