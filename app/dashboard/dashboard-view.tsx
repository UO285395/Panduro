"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Level } from "@/lib/curriculum/schema";
import type { UserSnapshot } from "@/lib/progress/queries";
import { HeartsBar } from "@/components/gamification/HeartsBar";

const ThingMascot = dynamic(
  () => import("@/components/mascot/ThingMascot").then((m) => ({ default: m.ThingMascot })),
  { ssr: false },
);

type SequenceEntry = { unitId: string; lessonId: string };

export function DashboardView({
  level,
  levels,
  sequence,
  snapshot,
  demo,
  onSignOut,
}: {
  level: Level;
  levels?: Level[];
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
        <div className="flex items-center gap-3">
          <ThingMascot state="idle" />
          <div>
            <h1 className="text-3xl font-bold">Hola, {snapshot.displayName}</h1>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Nivel {level.id} · {level.title}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-sm">
            <div className="font-semibold text-brand-700">
              <XPCounter value={snapshot.xpTotal} /> XP
            </div>
            <StreakBadge days={snapshot.streakDays} />
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

      <div className="mb-6 grid gap-3 md:grid-cols-3">
        <ReviewCard
          pending={snapshot.pendingReviews.length}
          nextReviewDueAt={snapshot.nextReviewDueAt}
        />
        <TranslateCard />
        <GlossaryCard />
      </div>

      <div className="space-y-10">
        {(levels ?? [level]).map((lvl) => (
          <div key={lvl.id} className="space-y-10">
            {(levels ?? [level]).length > 1 && (
              <div className="flex items-center gap-2 border-b border-slate-200 pb-2 dark:border-slate-700">
                <span className="rounded bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-300">
                  {lvl.id}
                </span>
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">{lvl.title}</span>
              </div>
            )}
            {lvl.units.map((unit) => (
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

function ReviewCard({
  pending,
  nextReviewDueAt,
}: {
  pending: number;
  nextReviewDueAt: number | null;
}) {
  const has = pending > 0;
  return (
    <Link
      href="/review"
      className={`flex items-center justify-between gap-4 rounded-2xl border p-4 transition ${
        has
          ? "border-brand-400 bg-brand-50 hover:bg-brand-100 dark:border-brand-700 dark:bg-brand-950/40 dark:hover:bg-brand-950"
          : "border-slate-200 bg-slate-50 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
      }`}
    >
      <div>
        <h3 className="font-semibold">
          {has
            ? `Repaso diario · ${pending} tarjeta${pending === 1 ? "" : "s"}`
            : "Al día"}
        </h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {has
            ? "Repite lo que ya conoces con repetición espaciada."
            : nextReviewDueAt
              ? `Próxima tarjeta: ${new Date(nextReviewDueAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`
              : "Completa una lección para tener repasos disponibles."}
        </p>
      </div>
      <span
        aria-hidden
        className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${
          has
            ? "bg-brand-600 text-white"
            : "bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300"
        }`}
      >
        {has ? "Repasar" : "Sin pendientes"}
      </span>
    </Link>
  );
}

function XPCounter({ value }: { value: number }) {
  const [displayed, setDisplayed] = useState(value);
  const prevRef = useRef(value);

  useEffect(() => {
    const from = prevRef.current;
    const to = value;
    if (from === to) return;
    prevRef.current = to;
    const start = performance.now();
    const duration = 700;
    let rafId: number;
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = t * t * (3 - 2 * t);
      setDisplayed(Math.round(from + (to - from) * ease));
      if (t < 1) rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [value]);

  return <span className="tabular-nums">{displayed}</span>;
}

function StreakBadge({ days }: { days: number }) {
  const active = days > 0;
  return (
    <div className="flex items-center gap-1 text-slate-500">
      <span
        className={active ? "animate-bounce inline-block" : "inline-block opacity-50"}
        style={{ animationDuration: "1.2s" }}
      >
        🔥
      </span>
      <span className={active ? "font-semibold text-orange-600 dark:text-orange-400" : ""}>
        {days}
      </span>
      <span className="text-xs">días</span>
    </div>
  );
}

function TranslateCard() {
  return (
    <Link
      href="/translate"
      className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-brand-400 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
    >
      <div>
        <h3 className="font-semibold">Traductor · práctica libre</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Signa lo que quieras y ve la transcripción en tiempo real.
        </p>
      </div>
      <span
        aria-hidden
        className="shrink-0 rounded-full bg-accent-500 px-3 py-1 text-xs font-semibold text-white"
      >
        Abrir
      </span>
    </Link>
  );
}

function GlossaryCard() {
  return (
    <Link
      href="/glossary"
      className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-brand-400 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:hover:bg-slate-800"
    >
      <div>
        <h3 className="font-semibold">Glosario de signos</h3>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Consulta todos los signos del currículo con animación.
        </p>
      </div>
      <span
        aria-hidden
        className="shrink-0 rounded-full bg-slate-600 px-3 py-1 text-xs font-semibold text-white"
      >
        Ver
      </span>
    </Link>
  );
}
