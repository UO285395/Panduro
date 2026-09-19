"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSnapshotDemo, isSignedIn } from "@/lib/storage/demoStore";
import { getLessonSequence } from "@/lib/curriculum/loader";
import type { UserSnapshot } from "@/lib/progress/queries";
import { StatsView } from "./stats-view";

export function StatsDemo() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<UserSnapshot | null>(null);

  useEffect(() => {
    if (!isSignedIn()) {
      router.replace("/");
      return;
    }
    setSnapshot(getSnapshotDemo());
  }, [router]);

  if (!snapshot) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-12">
        <p className="text-slate-500">Cargando…</p>
      </main>
    );
  }

  const sequence = getLessonSequence();

  const letterScores: Record<string, number> = {};
  for (const { lesson } of sequence) {
    const progress = snapshot.progressByLesson.get(lesson.id);
    const score = progress?.bestScore ?? 0;
    for (const ex of lesson.exercises) {
      if (ex.type === "sign_this") {
        const existing = letterScores[ex.letterId] ?? 0;
        if (score > existing) letterScores[ex.letterId] = score;
      }
    }
  }

  const completedCount = [...snapshot.progressByLesson.values()].filter(
    (p) => p.status === "completed" || p.status === "perfected",
  ).length;
  const perfectedCount = [...snapshot.progressByLesson.values()].filter(
    (p) => p.status === "perfected",
  ).length;

  return (
    <StatsView
      xpTotal={snapshot.xpTotal}
      streakDays={snapshot.streakDays}
      completedCount={completedCount}
      perfectedCount={perfectedCount}
      totalLessons={sequence.length}
      letterScores={letterScores}
    />
  );
}
