"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { Level } from "@/lib/curriculum/schema";
import type { UserSnapshot } from "@/lib/progress/queries";
import { HeartsBar } from "@/components/gamification/HeartsBar";
import { Logo } from "@/components/ui/Logo";
import { Icon, type IconName } from "@/components/ui/Icon";

const HandMascot = dynamic(
  () => import("@/components/mascot/HandMascot").then((m) => ({ default: m.HandMascot })),
  { ssr: false, loading: () => <div className="h-24 w-24 shrink-0" /> },
);

type SequenceEntry = { unitId: string; lessonId: string };
type LessonState = "done" | "perfected" | "next" | "locked";

/** Desplazamiento lateral de los nodos del camino, en zigzag suave. */
const ZIGZAG = ["0rem", "1.75rem", "2.75rem", "1.75rem", "0rem", "-1rem", "-1.5rem", "-1rem"];

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
  const allLevels = levels ?? [level];
  const statusOf = (lessonId: string) => snapshot.progressByLesson.get(lessonId)?.status;
  const isDone = (lessonId: string | undefined) => {
    const s = lessonId ? statusOf(lessonId) : "completed";
    return s === "completed" || s === "perfected";
  };
  const nextLessonId = sequence.find(({ lessonId }) => !isDone(lessonId))?.lessonId;

  const stateOf = (lessonId: string): LessonState => {
    if (statusOf(lessonId) === "perfected") return "perfected";
    if (isDone(lessonId)) return "done";
    const idx = sequence.findIndex((x) => x.lessonId === lessonId);
    const previousDone = idx === 0 || isDone(sequence[idx - 1]?.lessonId);
    return previousDone ? "next" : "locked";
  };

  const nextLesson = allLevels
    .flatMap((l) => l.units.flatMap((unit) => unit.lessons.map((lesson) => ({ lesson, unit }))))
    .find((x) => x.lesson.id === nextLessonId);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-16 pt-4 sm:px-6">
      <TopBar snapshot={snapshot} onSignOut={onSignOut} />

      {demo && (
        <p className="mb-6 rounded-2xl bg-accent-100 px-4 py-2 text-sm text-accent-700 dark:bg-accent-700/20 dark:text-accent-100">
          <b>Modo demo.</b> Tu progreso se guarda solo en este navegador.{" "}
          <Link href="/dev/demo-reset" className="font-semibold underline underline-offset-2">
            Reiniciar
          </Link>
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <aside className="space-y-4 lg:sticky lg:top-6 lg:col-start-2 lg:row-start-1 lg:self-start">
          <section className="card overflow-hidden">
            <div className="flex items-center gap-2 bg-brand-50 px-3 py-2 dark:bg-brand-950/40">
              <HandMascot mood="idle" size={96} />
              <div className="min-w-0">
                <p className="eyebrow">¡Hola!</p>
                <h1 className="truncate text-3xl font-extrabold leading-tight">{snapshot.displayName}</h1>
              </div>
            </div>
            <div className="space-y-3 p-4">
              {nextLesson ? (
                <>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    Sigue con <b className="text-slate-700 dark:text-slate-200">{nextLesson.unit.title}</b>
                  </p>
                  <Link href={`/lesson/${nextLesson.lesson.id}`} className="btn-primary w-full">
                    <Icon name="play" size={18} className="shrink-0" />
                    <span className="truncate">{nextLesson.lesson.title}</span>
                  </Link>
                </>
              ) : (
                <p className="font-display text-lg font-bold text-petrol-600 dark:text-petrol-300">
                  ¡Has completado todas las lecciones!
                </p>
              )}
            </div>
          </section>

          <ReviewCard pending={snapshot.pendingReviews.length} nextReviewDueAt={snapshot.nextReviewDueAt} />

          <Tools className="hidden lg:grid" />
        </aside>

        <div className="space-y-6 lg:col-start-1 lg:row-start-1">
          {allLevels.map((lvl) => {
            const lessons = lvl.units.flatMap((u) => u.lessons);
            const done = lessons.filter((l) => isDone(l.id)).length;
            const current = lessons.some((l) => l.id === nextLessonId);
            return (
              <details key={lvl.id} open={current || allLevels.length === 1} className="group space-y-6">
                <summary className="card flex cursor-pointer list-none items-center gap-4 p-4 [&::-webkit-details-marker]:hidden">
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl font-display text-lg font-extrabold ${
                      done === lessons.length
                        ? "bg-petrol-500 text-white"
                        : current
                          ? "bg-brand-500 text-white"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                  >
                    {lvl.id}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display text-xl font-extrabold">
                      {lvl.title.replace(/^LSE [A-C][12] · /, "")}
                    </span>
                    <span className="mt-1.5 flex items-center gap-3">
                      <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <span
                          className="block h-full rounded-full bg-petrol-500"
                          style={{ width: `${(done / Math.max(1, lessons.length)) * 100}%` }}
                        />
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-slate-500 dark:text-slate-400">
                        {done}/{lessons.length}
                      </span>
                    </span>
                  </span>
                  <Icon
                    name="arrow"
                    size={20}
                    className="shrink-0 rotate-90 text-slate-400 transition-transform group-open:-rotate-90"
                  />
                </summary>

                {lvl.units.map((unit) => {
                  const unitDone = unit.lessons.filter((l) => isDone(l.id)).length;
                  const unitCurrent = unit.lessons.some((l) => l.id === nextLessonId);
                  const tone =
                    unitDone === unit.lessons.length
                      ? "bg-petrol-500 text-white"
                      : unitCurrent
                        ? "bg-brand-500 text-white"
                        : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
                  return (
                    <section key={unit.id} aria-labelledby={`unit-${unit.id}`} className="space-y-5">
                      <div className={`rounded-3xl px-5 py-4 ${tone}`}>
                        <p className="font-display text-sm font-bold uppercase tracking-[0.08em] opacity-80">
                          {unitDone}/{unit.lessons.length} lecciones
                        </p>
                        <h2 id={`unit-${unit.id}`} className="text-2xl font-extrabold leading-tight">
                          {unit.title}
                        </h2>
                        {unit.summary && <p className="mt-1 text-sm opacity-90">{unit.summary}</p>}
                      </div>

                      <ol className="space-y-3 px-2 sm:px-6">
                        {unit.lessons.map((lesson, i) => (
                          <LessonNode
                            key={lesson.id}
                            index={i}
                            lessonId={lesson.id}
                            title={lesson.title}
                            goal={lesson.goal}
                            state={stateOf(lesson.id)}
                            bestScore={snapshot.progressByLesson.get(lesson.id)?.bestScore ?? 0}
                          />
                        ))}
                      </ol>
                    </section>
                  );
                })}
              </details>
            );
          })}
        </div>

        {/* En el móvil, después del mapa: lo primero es seguir con las lecciones. */}
        <Tools className="grid lg:hidden" />
      </div>
    </main>
  );
}

function Tools({ className }: { className: string }) {
  return (
    <nav aria-label="Más prácticas" className={`gap-3 sm:grid-cols-2 lg:grid-cols-1 ${className}`}>
      <ToolLink href="/translate" icon="hand" title="Traductor" text="Signa lo que quieras y ve la transcripción." />
      <ToolLink href="/glossary" icon="book" title="Glosario" text="Todos los signos, con su animación." />
    </nav>
  );
}

function TopBar({ snapshot, onSignOut }: { snapshot: UserSnapshot; onSignOut?: () => void }) {
  return (
    <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <Link href="/dashboard" className="flex items-center gap-2" aria-label="Panduro, inicio">
        <Logo />
        <span className="hidden font-display text-2xl font-extrabold text-brand-600 dark:text-brand-400 sm:inline">
          Panduro
        </span>
      </Link>
      <div className="flex items-center gap-1.5 sm:gap-2">
        <span
          className={`chip ${
            snapshot.streakDays > 0
              ? "bg-accent-100 text-accent-700 dark:bg-accent-700/25 dark:text-accent-100"
              : "bg-slate-100 text-slate-400 dark:bg-slate-800"
          }`}
          title="Días seguidos practicando"
        >
          <Icon name="flame" size={18} />
          <span className="tabular-nums">{snapshot.streakDays}</span>
          <span className="sr-only">días de racha</span>
        </span>
        <span className="chip bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-200" title="Experiencia">
          <Icon name="star" size={18} />
          <XPCounter value={snapshot.xpTotal} />
          <span className="sr-only">XP</span>
        </span>
        <HeartsBar hearts={snapshot.hearts} />
        <Link href="/stats" className="icon-btn" aria-label="Mis estadísticas" title="Mis estadísticas">
          <Icon name="chart" />
        </Link>
        {onSignOut && (
          <button type="button" onClick={onSignOut} className="icon-btn" aria-label="Salir" title="Salir">
            <Icon name="logout" />
          </button>
        )}
      </div>
    </header>
  );
}

function LessonNode({
  index,
  lessonId,
  title,
  goal,
  state,
  bestScore,
}: {
  index: number;
  lessonId: string;
  title: string;
  goal?: string;
  state: LessonState;
  bestScore: number;
}) {
  const locked = state === "locked";
  const tone = {
    done: "bg-petrol-500 text-white shadow-petrol-700",
    perfected: "bg-accent-500 text-white shadow-accent-700",
    next: "bg-brand-500 text-white shadow-brand-700 ring-8 ring-brand-200/70 dark:ring-brand-800/60",
    locked: "bg-slate-200 text-slate-400 shadow-slate-300 dark:bg-slate-800 dark:text-slate-500 dark:shadow-slate-950",
  }[state];
  const icon: IconName = { perfected: "star", done: "check", next: "play", locked: "lock" }[state] as IconName;

  const circle = (
    <span
      className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-full shadow-press transition-[transform,box-shadow] ${tone} ${
        locked ? "" : "group-hover:-translate-y-0.5 group-active:translate-y-[3px] group-active:shadow-press-sm"
      }`}
    >
      <Icon name={icon} size={28} />
    </span>
  );
  const label = (
    <span className="min-w-0">
      <span
        className={`block font-display text-lg font-bold leading-tight ${locked ? "text-slate-400 dark:text-slate-500" : ""}`}
      >
        {title}
      </span>
      {state === "next" && goal && <span className="block text-sm text-slate-600 dark:text-slate-400">{goal}</span>}
      {(state === "done" || state === "perfected") && (
        <span className="block text-sm text-slate-500 dark:text-slate-400">
          Mejor: {bestScore} %{state === "perfected" ? " · perfecta" : ""}
        </span>
      )}
    </span>
  );

  return (
    <li style={{ marginLeft: ZIGZAG[index % ZIGZAG.length] }}>
      {locked ? (
        <div aria-disabled className="flex items-center gap-4 py-1">
          {circle}
          {label}
          <span className="sr-only">(bloqueada)</span>
        </div>
      ) : (
        <Link
          href={`/lesson/${lessonId}`}
          className="group flex items-center gap-4 rounded-3xl py-1 pr-3 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-300/60"
        >
          {circle}
          {label}
          {state === "next" && <span className="btn-primary btn-sm ml-auto hidden sm:inline-flex">Empezar</span>}
        </Link>
      )}
    </li>
  );
}

function ReviewCard({ pending, nextReviewDueAt }: { pending: number; nextReviewDueAt: number | null }) {
  const has = pending > 0;
  return (
    <Link
      href="/review"
      className={`card flex items-center gap-4 p-4 transition hover:border-brand-300 ${
        has ? "border-2 border-brand-300 dark:border-brand-700" : ""
      }`}
    >
      <span
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl ${
          has ? "bg-brand-500 text-white" : "bg-slate-100 text-slate-400 dark:bg-slate-800"
        }`}
      >
        <Icon name="repeat" size={24} />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-lg font-bold leading-tight">
          {has ? `Repaso · ${pending} tarjeta${pending === 1 ? "" : "s"}` : "Repaso al día"}
        </span>
        <span className="block text-sm text-slate-500 dark:text-slate-400">
          {has
            ? "Lo que ya conoces, justo antes de olvidarlo."
            : nextReviewDueAt
              ? `Próxima tarjeta: ${new Date(nextReviewDueAt).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}`
              : "Completa una lección para tener repasos."}
        </span>
      </span>
    </Link>
  );
}

function ToolLink({ href, icon, title, text }: { href: string; icon: IconName; title: string; text: string }) {
  return (
    <Link href={href} className="card flex items-center gap-4 p-4 transition hover:border-petrol-300">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-petrol-50 text-petrol-600 dark:bg-petrol-950 dark:text-petrol-300">
        <Icon name={icon} size={24} />
      </span>
      <span className="min-w-0">
        <span className="block font-display text-lg font-bold leading-tight">{title}</span>
        <span className="block text-sm text-slate-500 dark:text-slate-400">{text}</span>
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
