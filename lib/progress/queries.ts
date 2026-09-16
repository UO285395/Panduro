import { createClient } from "@/lib/supabase/server";
import { MAX_HEARTS } from "@/lib/gamification/xp";
import { applyLazySettings } from "@/lib/gamification/lazy";

export type LessonProgress = {
  lessonId: string;
  status: "locked" | "unlocked" | "completed" | "perfected";
  bestScore: number;
};

export type PendingReview = {
  cardId: string;
  dueAt: number; // epoch ms
};

export type UserSnapshot = {
  displayName: string;
  hearts: number;
  heartsRegenAt: number | null;
  xpTotal: number;
  streakDays: number;
  progressByLesson: Map<string, LessonProgress>;
  pendingReviews: PendingReview[];
  /** Fecha de la próxima revisión (útil para pintar el estado vacío). */
  nextReviewDueAt: number | null;
};

const defaultSnapshot: UserSnapshot = {
  displayName: "estudiante",
  hearts: MAX_HEARTS,
  heartsRegenAt: null,
  xpTotal: 0,
  streakDays: 0,
  progressByLesson: new Map(),
  pendingReviews: [],
  nextReviewDueAt: null,
};

export async function getUserSnapshot(nowMs = Date.now()): Promise<UserSnapshot | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileRes, progressRes, reviewsRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, hearts, hearts_regen_at, xp_total, streak_days, streak_last_day")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("progress")
      .select("lesson_id, status, best_score")
      .eq("user_id", user.id),
    supabase
      .from("reviews")
      .select("card_id, ease, interval_days, repetitions, due_at")
      .eq("user_id", user.id)
      .lte("due_at", new Date(nowMs).toISOString())
      .order("due_at", { ascending: true })
      .limit(20),
  ]);

  const progressByLesson = new Map<string, LessonProgress>();
  for (const row of progressRes.data ?? []) {
    progressByLesson.set(row.lesson_id, {
      lessonId: row.lesson_id,
      status: row.status as LessonProgress["status"],
      bestScore: row.best_score ?? 0,
    });
  }

  const pendingReviews: PendingReview[] = (reviewsRes.data ?? []).map((r) => ({
    cardId: r.card_id,
    dueAt: new Date(r.due_at).getTime(),
  }));

  // Aplica lazy settings (regeneración corazones + rotura de racha) y persiste si cambian.
  const heartsRegenAt = profileRes.data?.hearts_regen_at
    ? new Date(profileRes.data.hearts_regen_at).getTime()
    : null;
  const lazy = applyLazySettings(
    {
      hearts: profileRes.data?.hearts ?? MAX_HEARTS,
      heartsRegenAt,
      streakDays: profileRes.data?.streak_days ?? 0,
      streakLastDay: profileRes.data?.streak_last_day ?? null,
    },
    nowMs,
  );
  if (lazy.changed) {
    await supabase
      .from("profiles")
      .update({
        hearts: lazy.next.hearts,
        hearts_regen_at: lazy.next.heartsRegenAt
          ? new Date(lazy.next.heartsRegenAt).toISOString()
          : null,
        streak_days: lazy.next.streakDays,
      })
      .eq("id", user.id);
  }

  return {
    ...defaultSnapshot,
    displayName:
      profileRes.data?.display_name ??
      (user.user_metadata?.display_name as string | undefined) ??
      user.email ??
      "estudiante",
    hearts: lazy.next.hearts,
    heartsRegenAt: lazy.next.heartsRegenAt,
    xpTotal: profileRes.data?.xp_total ?? 0,
    streakDays: lazy.next.streakDays,
    progressByLesson,
    pendingReviews,
    nextReviewDueAt: pendingReviews[0]?.dueAt ?? null,
  };
}
