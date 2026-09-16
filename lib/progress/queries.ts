import { createClient } from "@/lib/supabase/server";
import { MAX_HEARTS } from "@/lib/gamification/xp";

export type LessonProgress = {
  lessonId: string;
  status: "locked" | "unlocked" | "completed" | "perfected";
  bestScore: number;
};

export type UserSnapshot = {
  displayName: string;
  hearts: number;
  xpTotal: number;
  streakDays: number;
  progressByLesson: Map<string, LessonProgress>;
};

const defaultSnapshot: UserSnapshot = {
  displayName: "estudiante",
  hearts: MAX_HEARTS,
  xpTotal: 0,
  streakDays: 0,
  progressByLesson: new Map(),
};

export async function getUserSnapshot(): Promise<UserSnapshot | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [profileRes, progressRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("display_name, hearts, xp_total, streak_days")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("progress")
      .select("lesson_id, status, best_score")
      .eq("user_id", user.id),
  ]);

  const progressByLesson = new Map<string, LessonProgress>();
  for (const row of progressRes.data ?? []) {
    progressByLesson.set(row.lesson_id, {
      lessonId: row.lesson_id,
      status: row.status as LessonProgress["status"],
      bestScore: row.best_score ?? 0,
    });
  }

  return {
    ...defaultSnapshot,
    displayName:
      profileRes.data?.display_name ??
      (user.user_metadata?.display_name as string | undefined) ??
      user.email ??
      "estudiante",
    hearts: profileRes.data?.hearts ?? MAX_HEARTS,
    xpTotal: profileRes.data?.xp_total ?? 0,
    streakDays: profileRes.data?.streak_days ?? 0,
    progressByLesson,
  };
}
