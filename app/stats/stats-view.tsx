"use client";

import Link from "next/link";

const LETTERS = "ABCDEFGHIJKLMNÑOPQRSTUVWXYZ".split("");

type Props = {
  xpTotal: number;
  streakDays: number;
  completedCount: number;
  perfectedCount: number;
  totalLessons: number;
  letterScores: Record<string, number>;
};

export function StatsView({
  xpTotal,
  streakDays,
  completedCount,
  perfectedCount,
  totalLessons,
  letterScores,
}: Props) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-8">
      <header className="space-y-1">
        <Link href="/dashboard" className="text-xs text-brand-600 hover:underline">
          ← Panel
        </Link>
        <h1 className="text-2xl font-bold">Mis estadísticas</h1>
      </header>

      {/* Summary row */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatTile label="XP total" value={xpTotal.toString()} color="brand" />
        <StatTile
          label="Racha"
          value={`${streakDays} día${streakDays !== 1 ? "s" : ""}`}
          color="orange"
        />
        <StatTile
          label="Lecciones"
          value={`${completedCount}/${totalLessons}`}
          color="green"
        />
        <StatTile
          label="Perfeccionadas"
          value={perfectedCount.toString()}
          color="amber"
        />
      </div>

      {/* Letter heatmap */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Dactilología · precisión por letra
        </h2>
        <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-9">
          {LETTERS.map((letter) => {
            const score = letterScores[letter] ?? null;
            return (
              <div
                key={letter}
                title={score !== null ? `${letter}: ${score}%` : `${letter}: sin datos`}
                className={`flex aspect-square items-center justify-center rounded-lg text-sm font-bold ${heatmapClass(score)}`}
              >
                {letter}
              </div>
            );
          })}
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-500">
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm bg-slate-200 dark:bg-slate-700" />
            Sin datos
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm bg-red-200 dark:bg-red-900/50" />
            &lt;50%
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm bg-amber-200 dark:bg-amber-800/60" />
            50–69%
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm bg-green-200 dark:bg-green-800/60" />
            70–89%
          </span>
          <span className="flex items-center gap-1">
            <span className="h-3 w-3 rounded-sm bg-green-500" />
            ≥90%
          </span>
        </div>
      </section>

      {/* Progress bar */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-500">
          Progreso del currículo
        </h2>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Completadas</span>
            <span className="font-semibold">{completedCount} / {totalLessons}</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className="h-full rounded-full bg-brand-600 transition-all duration-500"
              style={{ width: `${totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0}%` }}
            />
          </div>
          <div className="flex justify-between text-sm">
            <span>Perfeccionadas</span>
            <span className="font-semibold text-amber-600 dark:text-amber-400">{perfectedCount} / {totalLessons}</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
            <div
              className="h-full rounded-full bg-amber-500 transition-all duration-500"
              style={{ width: `${totalLessons > 0 ? Math.round((perfectedCount / totalLessons) * 100) : 0}%` }}
            />
          </div>
        </div>
      </section>
    </main>
  );
}

function StatTile({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: "brand" | "green" | "amber" | "orange";
}) {
  const colorClass = {
    brand: "bg-brand-50 text-brand-700 dark:bg-brand-950/40 dark:text-brand-300",
    green: "bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300",
    orange: "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-300",
  }[color];

  return (
    <div className={`rounded-2xl p-4 ${colorClass}`}>
      <p className="text-xs font-medium opacity-75">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function heatmapClass(score: number | null): string {
  if (score === null)
    return "bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500";
  if (score >= 90) return "bg-green-500 text-white";
  if (score >= 70) return "bg-green-200 text-green-800 dark:bg-green-800/60 dark:text-green-100";
  if (score >= 50) return "bg-amber-200 text-amber-800 dark:bg-amber-700/60 dark:text-amber-100";
  return "bg-red-200 text-red-800 dark:bg-red-900/50 dark:text-red-100";
}
