"use client";

import { useEffect, useState } from "react";
import { SignCard } from "@/components/sign/SignCard";
import type { Exercise, Sign } from "@/lib/curriculum/schema";

type Props = {
  exercise: Extract<Exercise, { type: "multiple_choice" }>;
  sign: Sign;
  onAnswer: (correct: boolean) => void;
  disabled: boolean;
};

export function MultipleChoice({ exercise, sign, onAnswer, disabled }: Props) {
  const [picked, setPicked] = useState<string | null>(null);

  function choose(option: string) {
    if (disabled || picked !== null) return;
    setPicked(option);
    onAnswer(option === exercise.answer);
  }

  // Las teclas 1-4 eligen la opción con ese número.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.target as HTMLElement)?.isContentEditable) return;
      const option = exercise.options[Number(e.key) - 1];
      if (option) choose(option);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <section className="space-y-6">
      <h2 className="exercise-title">{exercise.prompt}</h2>
      <SignCard sign={sign} hideAnswer={picked === null} />
      <ul className="grid gap-3 sm:grid-cols-2">
        {exercise.options.map((option, i) => {
          const revealed = picked !== null;
          const state = !revealed
            ? "idle"
            : option === exercise.answer
              ? "correct"
              : option === picked
                ? "wrong"
                : "dim";
          return (
            <li key={option}>
              <button
                type="button"
                onClick={() => choose(option)}
                disabled={disabled || revealed}
                aria-pressed={option === picked}
                data-state={state}
                className="choice"
              >
                <span className="choice-key" aria-hidden>
                  {i + 1}
                </span>
                {option}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
