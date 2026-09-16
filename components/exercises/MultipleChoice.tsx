"use client";

import { useState } from "react";
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

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold">{exercise.prompt}</h2>
      <SignCard sign={sign} />
      <ul className="grid gap-2 sm:grid-cols-2">
        {exercise.options.map((option) => {
          const isPicked = option === picked;
          const isCorrect = option === exercise.answer;
          const revealed = picked !== null;
          return (
            <li key={option}>
              <button
                type="button"
                onClick={() => choose(option)}
                disabled={disabled || revealed}
                aria-pressed={isPicked}
                className={`w-full rounded-xl border px-4 py-3 text-left font-medium transition ${
                  revealed
                    ? isCorrect
                      ? "border-green-500 bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100"
                      : isPicked
                        ? "border-red-500 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100"
                        : "border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
                    : "border-slate-200 bg-white hover:border-brand-400 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900"
                }`}
              >
                {option}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
