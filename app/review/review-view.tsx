"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { QUALITY_LABELS, type Quality } from "@/lib/srs/sm2";
import { labelForCard } from "@/lib/srs/scheduler";
import { getSign } from "@/lib/curriculum/structure";
import { getLetterMeta } from "@/lib/recognition/letters";
import type { PendingReview } from "@/lib/progress/queries";
import { AvatarPlayer } from "@/components/avatar/AvatarPlayer";
import { Icon } from "@/components/ui/Icon";
import { useSignClip } from "@/lib/avatar/useSignClip";

type Props = {
  cards: PendingReview[];
  onAnswer: (cardId: string, quality: Quality) => Promise<void>;
  nextReviewDueAt: number | null;
};

export function ReviewView({ cards, onAnswer, nextReviewDueAt }: Props) {
  const [step, setStep] = useState(0);
  const [done, setDone] = useState(0);
  const [shown, setShown] = useState(false);
  const [pending, startTransition] = useTransition();
  const current = cards[step];
  const meta = current ? describeCard(current.cardId) : null;
  // Se pide al montar la tarjeta, para que al darle la vuelta el signo ya esté.
  const clip = useSignClip(meta?.kind === "sign" ? meta.id : null);

  if (cards.length === 0) {
    return <EmptyState nextReviewDueAt={nextReviewDueAt} />;
  }

  if (!current || !meta) {
    return <Summary done={done} />;
  }

  function pick(key: keyof typeof QUALITY_LABELS) {
    if (pending || !current) return;
    const q = QUALITY_LABELS[key] as Quality;
    startTransition(async () => {
      await onAnswer(current.cardId, q);
      setDone((n) => n + 1);
      setShown(false);
      setStep((s) => s + 1);
    });
  }

  const pct = Math.round((step / cards.length) * 100);
  return (
    <main className="mx-auto max-w-xl space-y-6 px-4 pb-10 pt-3">
      <header className="flex items-center gap-3">
        <Link href="/dashboard" aria-label="Salir del repaso" className="icon-btn -ml-2">
          <Icon name="close" size={22} />
        </Link>
        <div
          className="h-4 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progreso del repaso"
        >
          <div
            className="h-full rounded-full bg-petrol-500 transition-[width] duration-500"
            style={{ width: `${Math.max(pct, 4)}%` }}
          />
        </div>
        <span className="font-display font-bold tabular-nums text-slate-500">
          {step + 1}/{cards.length}
        </span>
      </header>

      <section className="card space-y-4 p-6 text-center sm:p-8" aria-live="polite">
        <p className="eyebrow">{meta.kind === "letter" ? "Letra" : "¿Recuerdas cómo se signa?"}</p>
        <h1 className="text-5xl font-extrabold leading-none text-brand-600 dark:text-brand-400">{meta.title}</h1>
        {meta.kind === "sign" ? (
          shown ? (
            <div className="space-y-3">
              <div className="mx-auto w-fit overflow-hidden rounded-3xl bg-brand-100 dark:bg-brand-900/40">
                <AvatarPlayer clip={clip} label={meta.gloss} size={260} />
              </div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Glosa: {meta.gloss}</p>
            </div>
          ) : (
            <button type="button" onClick={() => setShown(true)} className="btn-secondary mx-auto">
              <Icon name="play" size={18} className="text-brand-500" /> Ver el signo
            </button>
          )
        ) : (
          meta.hint && <p className="text-slate-600 dark:text-slate-300">{meta.hint}</p>
        )}
      </section>

      <div className="space-y-2">
        <p className="text-center text-sm font-medium text-slate-500 dark:text-slate-400">¿Qué tal lo recordabas?</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <QualityButton onClick={() => pick("again")} label="No lo sé" tone="ko" disabled={pending} />
          <QualityButton onClick={() => pick("hard")} label="Difícil" tone="accent" disabled={pending} />
          <QualityButton onClick={() => pick("good")} label="Bien" tone="petrol" disabled={pending} />
          <QualityButton onClick={() => pick("easy")} label="Fácil" tone="brand" disabled={pending} />
        </div>
      </div>

      <p className="text-sm text-slate-500 dark:text-slate-400">
        Repetición espaciada (SM-2): «Bien» vuelve a preguntártelo en 1, 6 y 15 días; «No lo sé»,
        mañana.
      </p>
    </main>
  );
}

function describeCard(cardId: string): {
  kind: "sign" | "letter";
  id: string;
  title: string;
  gloss: string;
  hint: string | null;
} {
  if (cardId.startsWith("letter:")) {
    const letter = labelForCard(cardId);
    const meta = getLetterMeta(letter);
    return { kind: "letter", id: letter, title: letter, gloss: letter, hint: meta?.description ?? null };
  }
  const signId = labelForCard(cardId);
  const sign = getSign(signId);
  // La palabra delante; el signo, al darle la vuelta a la tarjeta.
  return {
    kind: "sign",
    id: signId,
    title: sign?.translation ?? signId,
    gloss: sign?.gloss ?? signId,
    hint: null,
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
    <main className="mx-auto max-w-md space-y-5 px-6 py-16 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-petrol-50 text-petrol-500 dark:bg-petrol-950">
        <Icon name="check" size={40} />
      </div>
      <h1 className="text-3xl font-extrabold">Repaso al día</h1>
      <p className="text-slate-600 dark:text-slate-400">
        {nextText
          ? `La próxima tarjeta se vence el ${nextText}.`
          : "Completa una lección primero para tener algo que repasar."}
      </p>
      <Link href="/dashboard" className="btn-primary w-full">
        Volver al panel
      </Link>
    </main>
  );
}

function Summary({ done }: { done: number }) {
  return (
    <main className="mx-auto max-w-md space-y-5 px-6 py-16 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-accent-100 text-accent-700 dark:bg-accent-700/25 dark:text-accent-100">
        <Icon name="star" size={40} />
      </div>
      <h1 className="text-3xl font-extrabold">¡Repaso terminado!</h1>
      <p className="text-slate-600 dark:text-slate-400">
        Has repasado <strong>{done}</strong> tarjeta{done === 1 ? "" : "s"}.
      </p>
      <Link href="/dashboard" className="btn-primary w-full">
        Volver al panel
      </Link>
    </main>
  );
}

function QualityButton({
  onClick,
  label,
  tone,
  disabled,
}: {
  onClick: () => void;
  label: string;
  tone: "ko" | "accent" | "petrol" | "brand";
  disabled: boolean;
}) {
  const cls = {
    ko: "bg-ko-500 shadow-ko-700 hover:bg-ko-600",
    accent: "bg-accent-500 text-slate-900 shadow-accent-700 hover:brightness-95",
    petrol: "bg-petrol-500 shadow-petrol-700 hover:bg-petrol-600",
    brand: "bg-brand-500 shadow-brand-700 hover:bg-brand-600",
  }[tone];
  return (
    <button type="button" onClick={onClick} disabled={disabled} className={`btn-primary btn-sm py-2.5 ${cls}`}>
      {label}
    </button>
  );
}
