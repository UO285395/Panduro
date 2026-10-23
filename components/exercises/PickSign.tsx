"use client";

import { useMemo, useState } from "react";
import { AvatarPlayer } from "@/components/avatar/AvatarPlayer";
import type { Exercise, Sign } from "@/lib/curriculum/schema";

type Props = {
  exercise: Extract<Exercise, { type: "pick_sign" }>;
  /** El signo buscado. */
  sign: Sign;
  /** Opciones en el orden del ejercicio (incluye `sign`). */
  options: Sign[];
  onAnswer: (correct: boolean) => void;
  disabled: boolean;
};

function shuffle<T>(items: T[], seed: number): T[] {
  const arr = [...items];
  let s = seed;
  for (let i = arr.length - 1; i > 0; i--) {
    s = (s * 9301 + 49297) % 233280;
    const j = Math.floor((s / 233280) * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

/**
 * «¿Cuál es el signo de…?»: se da la palabra y se elige su signo. Es la dirección que
 * hace falta para signar (de la idea al signo), la contraria a «¿qué significa?».
 * Un solo avatar muestra la opción que se toca, como en «Empareja».
 */
export function PickSign({ exercise, sign, options, onAnswer, disabled }: Props) {
  const seed = useMemo(
    () => exercise.id.split("").reduce((acc, ch) => (acc + ch.charCodeAt(0)) % 100000, 11),
    [exercise.id],
  );
  const [order] = useState(() => shuffle(options, seed));
  const [viewing, setViewing] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const revealed = picked !== null;
  const current = order[viewing];

  function choose() {
    if (disabled || revealed) return;
    setPicked(viewing);
    onAnswer(order[viewing]?.id === sign.id);
  }

  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <h2 className="exercise-title">{exercise.prompt}</h2>
        <p className="font-display text-3xl font-extrabold text-brand-600 dark:text-brand-400">«{sign.translation}»</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-[auto_1fr] sm:items-start">
        <div className="mx-auto overflow-hidden rounded-3xl bg-brand-100 dark:bg-brand-900/40">
          <AvatarPlayer clip={current?.avatarClip ?? null} size={260} />
        </div>
        <div className="space-y-2">
          <p className="text-sm text-slate-500 dark:text-slate-400">Toca cada opción para verla y elige la que signa «{sign.translation}».</p>
          <ul className="grid gap-2" aria-label="Opciones">
            {order.map((option, i) => {
              const isAnswer = option.id === sign.id;
              const state = revealed
                ? isAnswer
                  ? "correct"
                  : picked === i
                    ? "wrong"
                    : "dim"
                : viewing === i
                  ? "selected"
                  : "idle";
              return (
                <li key={option.id}>
                  <button
                    type="button"
                    onClick={() => setViewing(i)}
                    aria-pressed={viewing === i}
                    data-state={state}
                    className="choice justify-between"
                  >
                    <span className="flex items-center gap-3">
                      <span className="choice-key" aria-hidden>
                        {i + 1}
                      </span>
                      Opción {i + 1}
                    </span>
                    {revealed ? (
                      <span className="text-sm">{option.translation}</span>
                    ) : (
                      viewing === i && <span className="text-xs font-bold uppercase tracking-wider">Viendo</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <button
            type="button"
            onClick={choose}
            disabled={disabled || revealed}
            className="btn-primary w-full"
          >
            Es la opción {viewing + 1}
          </button>
        </div>
      </div>
    </section>
  );
}
