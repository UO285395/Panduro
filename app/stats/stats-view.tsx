"use client";

import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";

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
  const pct = (n: number) => (totalLessons > 0 ? Math.round((n / totalLessons) * 100) : 0);
  return (
    <main className="mx-auto max-w-3xl space-y-8 px-4 py-6 sm:px-6">
      <header className="space-y-3">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 font-display font-bold text-brand-600 hover:underline dark:text-brand-400"
        >
          <Icon name="arrow" size={16} className="rotate-180" /> Panel
        </Link>
        <h1 className="text-4xl font-extrabold">Mis estadísticas</h1>
      </header>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile icon="star" label="XP total" value={xpTotal.toString()} tone="brand" />
        <StatTile
          icon="flame"
          label="Racha"
          value={`${streakDays} día${streakDays !== 1 ? "s" : ""}`}
          tone="accent"
        />
        <StatTile icon="check" label="Lecciones" value={`${completedCount}/${totalLessons}`} tone="petrol" />
        <StatTile icon="trophy" label="Perfectas" value={perfectedCount.toString()} tone="accent" />
      </div>

      <section className="card space-y-4 p-5" aria-labelledby="progreso">
        <h2 id="progreso" className="eyebrow">
          Progreso del currículo
        </h2>
        <Bar label="Completadas" value={completedCount} total={totalLessons} pct={pct(completedCount)} tone="bg-petrol-500" />
        <Bar label="Perfectas" value={perfectedCount} total={totalLessons} pct={pct(perfectedCount)} tone="bg-accent-500" />
      </section>

      <section className="card space-y-4 p-5" aria-labelledby="letras">
        <h2 id="letras" className="eyebrow">
          Dactilología · acierto por letra
        </h2>
        <div className="grid grid-cols-7 gap-1.5 sm:grid-cols-9">
          {LETTERS.map((letter) => {
            const score = letterScores[letter] ?? null;
            return (
              <div
                key={letter}
                title={score !== null ? `${letter}: ${score} %` : `${letter}: sin datos`}
                className={`flex aspect-square items-center justify-center rounded-xl font-display text-lg font-extrabold ${heatmapClass(score)}`}
              >
                {letter}
              </div>
            );
          })}
        </div>
        <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
          {[
            ["bg-slate-100 dark:bg-slate-800", "Sin datos"],
            ["bg-ko-200 dark:bg-ko-900", "Menos del 50 %"],
            ["bg-accent-100 dark:bg-accent-700/50", "50–69 %"],
            ["bg-petrol-200 dark:bg-petrol-800", "70–89 %"],
            ["bg-petrol-500", "90 % o más"],
          ].map(([tone, label]) => (
            <li key={label} className="flex items-center gap-1.5">
              <span className={`h-3.5 w-3.5 rounded-md ${tone}`} />
              {label}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}

function Bar({ label, value, total, pct, tone }: { label: string; value: number; total: number; pct: number; tone: string }) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="font-display font-bold tabular-nums">
          {value} / {total}
        </span>
      </div>
      <div className="h-4 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
        <div className={`h-full rounded-full transition-[width] duration-500 ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function StatTile({
  icon,
  label,
  value,
  tone,
}: {
  icon: IconName;
  label: string;
  value: string;
  tone: "brand" | "petrol" | "accent";
}) {
  const toneClass = {
    brand: "bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-200",
    petrol: "bg-petrol-50 text-petrol-700 dark:bg-petrol-950 dark:text-petrol-200",
    accent: "bg-accent-100 text-accent-700 dark:bg-accent-700/20 dark:text-accent-100",
  }[tone];

  return (
    <div className={`rounded-3xl p-4 ${toneClass}`}>
      <p className="flex items-center gap-1.5 text-sm font-semibold opacity-80">
        <Icon name={icon} size={16} /> {label}
      </p>
      <p className="mt-1 font-display text-3xl font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

function heatmapClass(score: number | null): string {
  if (score === null) return "bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500";
  if (score >= 90) return "bg-petrol-500 text-white";
  if (score >= 70) return "bg-petrol-200 text-petrol-800 dark:bg-petrol-800 dark:text-petrol-100";
  if (score >= 50) return "bg-accent-100 text-accent-700 dark:bg-accent-700/50 dark:text-accent-100";
  return "bg-ko-200 text-ko-800 dark:bg-ko-900 dark:text-ko-100";
}
