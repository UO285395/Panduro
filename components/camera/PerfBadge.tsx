"use client";

import type { PerfStats } from "@/lib/mediapipe/types";

export function PerfBadge({
  stats,
  delegate,
}: {
  stats: PerfStats;
  delegate: "GPU" | "CPU" | "loading";
}) {
  return (
    <dl
      className="grid grid-cols-4 gap-3 rounded-xl border border-slate-200 bg-white p-3 text-xs dark:border-slate-800 dark:bg-slate-900"
      aria-label="Métricas de rendimiento del hand-tracking"
    >
      <Stat label="FPS" value={stats.fps.toFixed(1)} />
      <Stat label="P50 ms" value={stats.p50.toFixed(1)} />
      <Stat label="P95 ms" value={stats.p95.toFixed(1)} />
      <Stat label="Delegate" value={delegate} />
    </dl>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
        {value}
      </dd>
    </div>
  );
}
