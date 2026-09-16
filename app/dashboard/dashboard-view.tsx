"use client";

import Link from "next/link";
import type { Level } from "@/lib/curriculum/schema";
import type { UserSnapshot } from "@/lib/progress/queries";
import { HeartsBar } from "@/components/gamification/HeartsBar";

type SequenceEntry = { unitId: string; lessonId: string };

export function DashboardView({
  level,
  sequence,
  snapshot,
  demo,
  onSignOut,
}: {
  level: Level;
  sequence: SequenceEntry[];
  snapshot: UserSnapshot;
  demo?: boolean;
  onSignOut?: () => void;
}) {
  const nextIdx = sequence.findIndex(({ lessonId }) => {
    const s = snapshot.progressByLesson.get(lessonId)?.status;
    return s !== "completed" && s !== "perfected";
  });

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      {demo && (
        <div
          role="status"
          className="mb-4 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
        >
          Modo demo activo. Tu progreso se guarda solo en este navegador.{" "}
          <Link href="/dev/demo-reset" className="underline">
            Reiniciar
          </Link>
        </div>
      )}
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Hola, {snapshot.displayName} 👋</h1>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Nivel {level.id} · {level.title}
          </p>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <div className="font-semibold text-brand-700">
              {snapshot.xpTotal} XP
            </div>
            <div className="text-slate-500">🔥 {snapshot.streakDays} d</div>
          </div>
          <HeartsBar hearts={snapshot.hearts} />
          {onSignOut && (
            <button
              type="button"
              onClick={onSignOut}
              className="rounded-full border border-slate-300 px-4 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Salir
            </button>
          )}
        </div>
      </header>

      <div className="space-y-10">
        {level.units.map((unit) => (
          <section key={unit.id} aria-labelledby={`unit-${unit.id}`}>
            <div className="mb-4">
              <h2
                id={`unit-${unit.id}`}
                className="text-xl font-bold text-brand-700"
              >
                {unit.title}
              </h2>
              {unit.summary && (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {unit.summary}
                </p>
              )}
            </div>

            <ol className="relative space-y-4 border-l-2 border-brand-200 pl-6 dark:border-brand-800">
              {unit.lessons.map((lesson, idxInUnit) => {
                const globalIdx = sequence.findIndex(
                  (x) => x.lessonId === lesson.id,
                );
                const progress = snapshot.progressByLesson.get(lesson.id);
                const done =
                  progress?.status === "completed" ||
                  progress?.status === "perfected";
                const perfected = progress?.status === "perfected";
                const isNext = globalIdx === nextIdx;
                const previousDone =
                  globalIdx === 0 ||
                  (() => {
                    const prev = sequence[globalIdx - 1]?.lessonId;
                    const st = prev
                      ? snapshot.progressByLesson.get(prev)?.status
                      : "completed";
                    return st === "completed" || st === "perfected";
                  })();
                const locked = !done && !previousDone;

                return (
                  <li key={lesson.id} className="relative">
                    <span
                      aria-hidden
                      className={`absolute -left-[34px] flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold text-white ${
                        perfected
                          ? "bg-amber-500"
                          : done
                            ? "bg-green-600"
                            : isNext
                              ? "bg-brand-600"
                              : "bg-slate-300 dark:bg-slate-700"
                      }`}
                    >
                      {perfected ? "★" : done ? "✓" : idxInUnit + 1}
                    </span>
                    <LessonRow
                      lessonId={lesson.id}
                      title={lesson.title}
                      goal={lesson.goal}
                      locked={locked}
                      done={done}
                      perfected={perfected}
                      bestScore={progress?.bestScore ?? 0}
                    />
                  </li>
                );
              })}
            </ol>
          </section>
        ))}
      </div>
    </main>
  );
}

function LessonRow({
  lessonId,
  title,
  goal,
  locked,
  done,
  perfected,
  bestScore,
}: {
  lessonId: string;
  title: string;
  goal?: string;
  locked: boolean;
  done: boolean;
  perfected: boolean;
  bestScore: number;
}) {
  const body = (
    <div className="flex items-center justify-between gap-4">
      <div>
        <h3 className="font-semibold">{title}</h3>
        {goal && (
          <p className="text-sm text-slate-600 dark:text-slate-400">{goal}</p>
        )}
        {done && (
          <p className="mt-1 text-xs text-slate-500">
            Mejor: {bestScore}% {perfected ? "· perfeccionada ★" : ""}
          </p>
        )}
      </div>
      <span
        className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
          locked
            ? "bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400"
            : done
              ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
              : "bg-brand-600 text-white"
        }`}
      >
        {locked ? "Bloqueada" : done ? "Repasar" : "Empezar"}
      </span>
    </div>
  );

  if (locked) {
    return (
      <div
        aria-disabled
        className="block rounded-xl border border-slate-200 bg-slate-50 p-4 opacity-70 dark:border-slate-800 dark:bg-slate-900"
      >
        {body}
      </div>
    );
  }

  return (
    <Link
      href={`/lesson/${lessonId}`}
      className="block rounded-xl border border-slate-200 bg-white p-4 transition hover:border-brand-400 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900"
    >
      {body}
    </Link>
  );
}
