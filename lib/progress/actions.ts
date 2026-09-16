"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { computeLessonScore, MAX_HEARTS } from "@/lib/gamification/xp";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("hearts, xp_total")
    .eq("id", user.id)
    .single();

  const heartsBefore = profile?.hearts ?? MAX_HEARTS;
  const heartsAfter = Math.max(0, heartsBefore - input.heartsUsed);

  const { xp, bestScore, perfected } = computeLessonScore({
    correct: input.correct,
    total: input.total,
    heartsRemaining: heartsAfter,
  });

  // Upsert de progreso — quedamos con el mejor score histórico.
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
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,lesson_id" },
  );

  await supabase
    .from("profiles")
    .update({
      hearts: heartsAfter,
      xp_total: (profile?.xp_total ?? 0) + xp,
    })
    .eq("id", user.id);

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
