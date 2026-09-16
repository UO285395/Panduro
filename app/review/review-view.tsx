"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { QUALITY_LABELS, type Quality } from "@/lib/srs/sm2";
import { labelForCard } from "@/lib/srs/scheduler";
import { getSign } from "@/lib/curriculum/loader";
import { getLetterMeta } from "@/lib/recognition/templates";
import type { PendingReview } from "@/lib/progress/queries";

type Props = {
  cards: PendingReview[];
  onAnswer: (cardId: string, quality: Quality) => Promise<void>;
  nextReviewDueAt: number | null;
};

export function ReviewView({ cards, onAnswer, nextReviewDueAt }: Props) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(0);
  const [pending, startTransition] = useTransition();

  if (cards.length === 0) {
    return <EmptyState nextReviewDueAt={nextReviewDueAt} />;
  }

  if (step >= cards.length) {
    return <Summary done={done} />;
  }

  const current = cards[step]!;
  const meta = describeCard(current.cardId);

  function pick(key: keyof typeof QUALITY_LABELS) {
    if (pending) return;
    const q = QUALITY_LABELS[key] as Quality;
    startTransition(async () => {
      await onAnswer(current.cardId, q);
      setDone((n) => n + 1);
      setStep((s) => s + 1);
    });
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-8 space-y-6">
      <header className="flex items-center justify-between text-sm">
        <Link href="/dashboard" aria-label="Salir del repaso" className="text-slate-500">
          ✕
        </Link>
        <div className="flex-1 mx-4 h-2 rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${(step / cards.length) * 100}%` }}
          />
        </div>
        <span className="text-slate-500 tabular-nums">
          {step + 1}/{cards.length}
        </span>
      </header>

      <section className="rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
        <p className="text-xs uppercase tracking-wider text-slate-500">
          {meta.kind === "letter" ? "Letra" : "Signo"}
        </p>
        <div className="my-4 text-5xl font-bold text-brand-700 dark:text-brand-200">
          {meta.title}
        </div>
        {meta.hint && (
          <p className="text-sm text-slate-600 dark:text-slate-400">{meta.hint}</p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <QualityButton onClick={() => pick("again")} label="No lo sé" color="red" disabled={pending} />
        <QualityButton onClick={() => pick("hard")} label="Difícil" color="amber" disabled={pending} />
        <QualityButton onClick={() => pick("good")} label="Bien" color="green" disabled={pending} />
        <QualityButton onClick={() => pick("easy")} label="Fácil" color="brand" disabled={pending} />
      </div>

      <p className="text-xs text-slate-500">
        Los repasos usan repetición espaciada (SM-2): «Bien» reprograma en 1 → 6 →
        15 días. «No lo sé» vuelve a mañana.
      </p>
    </main>
  );
}

function describeCard(cardId: string): {
  kind: "sign" | "letter";
  title: string;
  hint: string | null;
} {
  if (cardId.startsWith("letter:")) {
    const letter = labelForCard(cardId);
    const meta = getLetterMeta(letter);
    return { kind: "letter", title: letter, hint: meta?.description ?? null };
  }
  const signId = labelForCard(cardId);
  const sign = getSign(signId);
  return {
    kind: "sign",
    title: sign?.gloss ?? signId,
    hint: sign?.translation ?? null,
  };
}

function EmptyState({ nextReviewDueAt }: { nextReviewDueAt: number | null }) {
  const nextText = nextReviewDueAt
    ? new Date(nextReviewDueAt).toLocaleString("es-ES", {
        weekday: "long",
        day: "numeric",
        month: "short",
      })
    : null;
  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center space-y-4">
      <div className="text-6xl">🌱</div>
      <h1 className="text-2xl font-bold">No hay repasos ahora</h1>
      <p className="text-slate-600 dark:text-slate-400">
        {nextText
          ? `La próxima tarjeta se vence el ${nextText}.`
          : "Completa una lección primero para tener algo que repasar."}
      </p>
      <Link
        href="/dashboard"
        className="inline-block rounded-full bg-brand-600 px-5 py-2 font-semibold text-white hover:bg-brand-700"
      >
        Volver al panel
      </Link>
    </main>
  );
}

function Summary({ done }: { done: number }) {
  return (
    <main className="mx-auto max-w-md px-6 py-16 text-center space-y-4">
      <div className="text-6xl">✨</div>
      <h1 className="text-2xl font-bold">¡Sesión terminada!</h1>
      <p className="text-slate-600 dark:text-slate-400">
        Has repasado <strong>{done}</strong> tarjeta{done === 1 ? "" : "s"}.
      </p>
      <Link
        href="/dashboard"
        className="inline-block rounded-full bg-brand-600 px-5 py-2 font-semibold text-white hover:bg-brand-700"
      >
        Volver al panel
      </Link>
    </main>
  );
}

function QualityButton({
  onClick,
  label,
  color,
  disabled,
}: {
  onClick: () => void;
  label: string;
  color: "red" | "amber" | "green" | "brand";
  disabled: boolean;
}) {
  const cls =
    color === "red"
      ? "bg-red-600 hover:bg-red-700"
      : color === "amber"
        ? "bg-amber-500 hover:bg-amber-600"
        : color === "green"
          ? "bg-green-600 hover:bg-green-700"
          : "bg-brand-600 hover:bg-brand-700";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`rounded-full px-4 py-2 font-semibold text-white shadow-sm disabled:opacity-60 ${cls}`}
    >
      {label}
    </button>
  );
}
