"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { AvatarPlayer } from "@/components/avatar/AvatarPlayer";
import type { HandMood } from "@/components/mascot/HandMascot";
import type { AvatarClip } from "@/lib/curriculum/schema";

const HandMascot = dynamic(
  () => import("@/components/mascot/HandMascot").then((m) => ({ default: m.HandMascot })),
  { ssr: false },
);

export type HeroSign = { id: string; word: string };

/** Pausa entre un signo y el siguiente (ms). */
const GAP_MS = 900;

/**
 * El escenario de la portada: el avatar signa unas palabras seguidas y la mano levanta el
 * pulgar al terminar cada una. Las palabras de debajo eligen cuál ver.
 */
export function HeroStage({ signs }: { signs: HeroSign[] }) {
  const [index, setIndex] = useState(0);
  const [clips, setClips] = useState<Record<string, AvatarClip>>({});
  const [mood, setMood] = useState<HandMood>("idle");
  const current = signs[index]!;
  const clip = clips[current.id] ?? null;

  useEffect(() => {
    let alive = true;
    for (const s of signs) {
      fetch(`/api/clips/${s.id}`)
        .then((r) => (r.ok ? (r.json() as Promise<AvatarClip>) : null))
        .then((c) => alive && c && setClips((all) => ({ ...all, [s.id]: c })))
        .catch(() => {});
    }
    return () => {
      alive = false;
    };
  }, [signs]);

  // Al acabar el signo: pulgar arriba y, tras una pausa, la palabra siguiente.
  useEffect(() => {
    if (!clip) return;
    setMood("idle");
    const done = setTimeout(() => setMood("correct"), clip.duration);
    const next = setTimeout(() => setIndex((i) => (i + 1) % signs.length), clip.duration + GAP_MS);
    return () => {
      clearTimeout(done);
      clearTimeout(next);
    };
  }, [clip, signs.length]);

  return (
    <div className="relative mx-auto w-full max-w-[26rem]">
      <div className="overflow-hidden rounded-[2rem] border-4 border-white bg-brand-100 shadow-[0_10px_0_0] shadow-brand-200 dark:border-slate-800 dark:bg-brand-900/40 dark:shadow-slate-950">
        <div className="flex aspect-square items-center justify-center [&_.avatar-host]:!h-full [&_.avatar-host]:!w-full">
          {clip || Object.keys(clips).length ? (
            <AvatarPlayer clip={clip} label={current.word} size={400} />
          ) : (
            <span className="h-24 w-24 animate-pulse rounded-full bg-brand-200/70 dark:bg-brand-800/50" />
          )}
        </div>
      </div>
      <div
        className="pointer-events-none absolute -bottom-12 -left-8 sm:-left-20"
        aria-hidden
      >
        <HandMascot mood={mood} size={170} />
      </div>
      <ul className="mt-6 flex flex-wrap justify-end gap-2 pl-28 sm:pl-24" aria-label="Signos de ejemplo">
        {signs.map((s, i) => (
          <li key={s.id}>
            <button
              type="button"
              onClick={() => setIndex(i)}
              aria-pressed={i === index}
              className={`chip border-2 transition ${
                i === index
                  ? "border-brand-500 bg-brand-500 text-white"
                  : "border-slate-200 bg-white text-slate-600 hover:border-brand-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
              }`}
            >
              {s.word}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
