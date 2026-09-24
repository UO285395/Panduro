"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { MascotState } from "@/components/mascot/ThingMascot";

const ThingMascot = dynamic(
  () => import("@/components/mascot/ThingMascot").then((m) => ({ default: m.ThingMascot })),
  { ssr: false },
);

const STATES: { id: MascotState; label: string }[] = [
  { id: "idle", label: "Reposo" },
  { id: "correct", label: "Acierto" },
  { id: "incorrect", label: "Fallo" },
  { id: "celebrate", label: "Celebrar" },
];

export function MascotPreview() {
  const [state, setState] = useState<MascotState>("idle");
  const [take, setTake] = useState(0);

  return (
    <div className="flex flex-wrap items-center gap-8">
      <div className="rounded-2xl bg-slate-100 p-4 dark:bg-slate-900">
        {/* `key` para repetir la misma reacción al pulsar otra vez. */}
        <ThingMascot key={take} state={state} size={320} />
      </div>
      <div className="flex flex-col gap-2">
        {STATES.map((s) => (
          <button
            key={s.id}
            type="button"
            onClick={() => {
              setState(s.id);
              if (s.id === state) setTake((t) => t + 1);
            }}
            className={`rounded-full px-4 py-2 text-sm font-semibold ${
              state === s.id ? "bg-brand-600 text-white" : "border border-slate-300 dark:border-slate-700"
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
