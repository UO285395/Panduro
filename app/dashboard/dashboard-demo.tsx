"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getLevel, getLessonSequence } from "@/lib/curriculum/loader";
import {
  getSnapshotDemo,
  isSignedIn,
  signOutDemo,
} from "@/lib/storage/demoStore";
import type { UserSnapshot } from "@/lib/progress/queries";
import { DashboardView } from "./dashboard-view";

export function DashboardDemo() {
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
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-slate-500">Cargando…</p>
      </main>
    );
  }

  const level = getLevel();
  const sequence = getLessonSequence().map(({ unit, lesson }) => ({
    unitId: unit.id,
    lessonId: lesson.id,
  }));

  return (
    <DashboardView
      level={level}
      sequence={sequence}
      snapshot={snapshot}
      demo
      onSignOut={() => {
        signOutDemo();
        router.replace("/");
      }}
    />
  );
}
