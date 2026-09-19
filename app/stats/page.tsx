import { redirect } from "next/navigation";
import { getUserSnapshot } from "@/lib/progress/queries";
import { getAllLevels, getLessonSequence } from "@/lib/curriculum/loader";
import { DEMO_MODE } from "@/lib/storage/flags";
import { StatsCloud } from "./stats-cloud";
import { StatsDemo } from "./stats-demo";

export const metadata = { title: "Mis estadísticas" };
export const dynamic = "force-dynamic";

export default async function StatsPage() {
  if (DEMO_MODE) {
    return <StatsDemo />;
  }

  const snapshot = await getUserSnapshot();
  if (!snapshot) redirect("/auth/login");

  const levels = getAllLevels();
  const sequence = getLessonSequence();

  // Collect sign_this letter data for heatmap
  const letterScores = new Map<string, number>();
  for (const { lesson } of sequence) {
    const progress = snapshot.progressByLesson.get(lesson.id);
    const score = progress?.bestScore ?? 0;
    for (const ex of lesson.exercises) {
      if (ex.type === "sign_this") {
        const existing = letterScores.get(ex.letterId) ?? 0;
        if (score > existing) letterScores.set(ex.letterId, score);
      }
    }
  }

  const completedCount = [...snapshot.progressByLesson.values()].filter(
    (p) => p.status === "completed" || p.status === "perfected",
  ).length;
  const perfectedCount = [...snapshot.progressByLesson.values()].filter(
    (p) => p.status === "perfected",
  ).length;
  const totalLessons = sequence.length;

  return (
    <StatsCloud
      xpTotal={snapshot.xpTotal}
      streakDays={snapshot.streakDays}
      completedCount={completedCount}
      perfectedCount={perfectedCount}
      totalLessons={totalLessons}
      letterScores={Object.fromEntries(letterScores)}
    />
  );
}
