"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import type { HandMood } from "@/components/mascot/HandMascot";

const HandMascot = dynamic(
  () => import("@/components/mascot/HandMascot").then((m) => ({ default: m.HandMascot })),
  { ssr: false },
);

const STATES: { id: HandMood; label: string }[] = [
  { id: "idle", label: "Reposo" },
  { id: "correct", label: "Acierto" },
  { id: "incorrect", label: "Fallo" },
  { id: "celebrate", label: "Celebrar" },
];

export function MascotPreview() {
  const [mood, setMood] = useState<HandMood>("idle");
  const [take, setTake] = useState(0);

  return (
    <div className="flex flex-wrap items-center gap-8">
      <div className="card p-4">
        {/* `key` para repetir la misma reacción al pulsar otra vez. */}
        <HandMascot key={take} mood={mood} size={320} />
      </div>
      <div className="flex flex-col gap-2">
        {STATES.map((s) => (
          <button
            key={s.id}
            type="button"
            data-mood={s.id}
            onClick={() => {
              setMood(s.id);
              if (s.id === mood) setTake((t) => t + 1);
            }}
            className={mood === s.id ? "btn-primary" : "btn-secondary"}
          >
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}
