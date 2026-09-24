"use client";

import { useMemo, useState } from "react";
import { AvatarPlayer } from "@/components/avatar/AvatarPlayer";
import type { AvatarClip, Sign } from "@/lib/curriculum/schema";

const SPEEDS = [1, 0.5] as const;

function slowed(clip: AvatarClip, speed: number): AvatarClip {
  if (speed === 1) return clip;
  return {
    ...clip,
    duration: Math.round(clip.duration / speed),
    keyframes: clip.keyframes.map((k) => ({ ...k, t: k.t / speed })),
  };
}

/**
 * Presentación de un signo nuevo antes de practicarlo: el avatar, la palabra y cómo se
 * hace. No puntúa ni gasta corazones.
 */
export function LearnCard({ sign, onContinue }: { sign: Sign; onContinue: () => void }) {
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const clip = useMemo(() => (sign.avatarClip ? slowed(sign.avatarClip, speed) : null), [sign.avatarClip, speed]);

  return (
    <section className="space-y-5">
      <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Signo nuevo</p>
      <div className="grid gap-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="overflow-hidden rounded-2xl bg-brand-100 dark:bg-brand-900/40">
          <AvatarPlayer clip={clip} label={sign.gloss} size={280} />
        </div>
        <div className="space-y-3">
          <h2 className="text-3xl font-bold">{sign.translation}</h2>
          <p className="text-xs uppercase tracking-wider text-slate-500">Glosa: {sign.gloss}</p>
          {sign.description && <p className="text-slate-700 dark:text-slate-200">{sign.description}</p>}
          {sign.handedness === "two" && (
            <p className="text-sm text-slate-500">Se hace con las dos manos.</p>
          )}
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500">Velocidad:</span>
            {SPEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSpeed(s)}
                aria-pressed={speed === s}
                className={`rounded-full px-3 py-1 font-semibold ${
                  speed === s ? "bg-brand-600 text-white" : "border border-slate-300 dark:border-slate-700"
                }`}
              >
                {s === 1 ? "Normal" : "Lenta"}
              </button>
            ))}
          </div>
          <p className="text-sm text-slate-500">Imítalo un par de veces antes de seguir.</p>
        </div>
      </div>
      <button
        type="button"
        onClick={onContinue}
        className="w-full rounded-full bg-brand-600 px-6 py-3 font-semibold text-white hover:bg-brand-700"
      >
        Entendido
      </button>
    </section>
  );
}
