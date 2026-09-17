"use client";

import { useState } from "react";
import { SignCard } from "@/components/sign/SignCard";
import type { Exercise, Sign } from "@/lib/curriculum/schema";

type Props = {
  exercise: Extract<Exercise, { type: "type_word" }>;
  sign: Sign;
  onAnswer: (correct: boolean) => void;
  disabled: boolean;
};

export function normalize(input: string): string {
  return input
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quita acentos
    .toLowerCase()
    .replace(/[¿?¡!.,;:"'()]/g, "")
    .trim();
}

export function TypeWord({ exercise, sign, onAnswer, disabled }: Props) {
  const [value, setValue] = useState("");
  const [locked, setLocked] = useState(false);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || locked || !value.trim()) return;
    const answer = normalize(value);
    const accepts = exercise.acceptable.map(normalize);
    const ok = accepts.includes(answer);
    setLocked(true);
    onAnswer(ok);
  }

  return (
    <section className="space-y-6">
      <h2 className="text-lg font-semibold">{exercise.prompt}</h2>
      <SignCard sign={sign} />
      <form onSubmit={onSubmit} className="space-y-3">
        <label className="block space-y-1">
          <span className="text-sm font-medium">Traducción</span>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={disabled || locked}
            autoFocus
            autoComplete="off"
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 disabled:bg-slate-100"
          />
        </label>
        <button
          type="submit"
          disabled={disabled || locked || !value.trim()}
          className="w-full rounded-full bg-brand-600 px-6 py-2 font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
        >
          Comprobar
        </button>
      </form>
    </section>
  );
}
