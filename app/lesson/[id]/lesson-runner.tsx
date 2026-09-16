"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Exercise, Lesson, Sign } from "@/lib/curriculum/schema";
import { HeartsBar } from "@/components/gamification/HeartsBar";
import { completeLesson } from "@/lib/progress/completeLesson";
import { MAX_HEARTS } from "@/lib/gamification/xp";
import { MultipleChoice } from "@/components/exercises/MultipleChoice";
import { MatchPairs } from "@/components/exercises/MatchPairs";
import { TypeWord } from "@/components/exercises/TypeWord";

type SignRecord = Record<string, Sign | undefined>;

type Feedback = { kind: "correct" | "wrong"; message?: string } | null;

export function LessonRunner({
  lesson,
  signs,
}: {
  lesson: Lesson;
  signs: SignRecord;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [correct, setCorrect] = useState(0);
  const [heartsUsed, setHeartsUsed] = useState(0);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [submitting, startTransition] = useTransition();
  const [result, setResult] = useState<{
    xp: number;
    bestScore: number;
    perfected: boolean;
  } | null>(null);

  const total = lesson.exercises.length;
  const current = lesson.exercises[step];
  const heartsLeft = Math.max(0, MAX_HEARTS - heartsUsed);
  const outOfHearts = heartsLeft === 0;

  function onAnswer(isCorrect: boolean) {
    if (isCorrect) {
      setCorrect((c) => c + 1);
      setFeedback({ kind: "correct", message: "¡Correcto!" });
    } else {
      setHeartsUsed((h) => h + 1);
      setFeedback({ kind: "wrong", message: "Casi. ¡Sigue!" });
    }
  }

  function onNext() {
    setFeedback(null);
    if (step + 1 < total) {
      setStep(step + 1);
    } else {
      finish();
    }
  }

  function finish() {
    startTransition(async () => {
      const res = await completeLesson({
        lessonId: lesson.id,
        correct,
        total,
        heartsUsed,
      });
      setResult({
        xp: res.xp,
        bestScore: res.bestScore,
        perfected: res.perfected,
      });
    });
  }

  if (outOfHearts && !result) {
    return (
      <OutOfHearts
        onExit={() => router.push("/dashboard")}
      />
    );
  }

  if (result) {
    return (
      <Result
        result={result}
        onContinue={() => {
          router.push("/dashboard");
          router.refresh();
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Header
        title={lesson.title}
        step={step}
        total={total}
        heartsLeft={heartsLeft}
      />

      <ExerciseView
        key={current.id}
        exercise={current}
        signs={signs}
        onAnswer={onAnswer}
        disabled={feedback !== null}
      />

      {feedback && (
        <FeedbackBar
          kind={feedback.kind}
          message={feedback.message}
          onNext={onNext}
          submitting={submitting}
          isLast={step + 1 === total}
        />
      )}
    </div>
  );
}

function Header({
  title,
  step,
  total,
  heartsLeft,
}: {
  title: string;
  step: number;
  total: number;
  heartsLeft: number;
}) {
  const pct = Math.round((step / total) * 100);
  return (
    <header className="space-y-3">
      <div className="flex items-center justify-between">
        <Link
          href="/dashboard"
          aria-label="Salir de la lección"
          className="text-slate-500 hover:text-slate-800 dark:hover:text-slate-100"
        >
          ✕
        </Link>
        <div
          className="h-2 flex-1 rounded-full bg-slate-200 dark:bg-slate-800 mx-4"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progreso de la lección"
        >
          <div
            className="h-full rounded-full bg-brand-500 transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <HeartsBar hearts={heartsLeft} />
      </div>
      <h1 className="text-lg font-semibold">{title}</h1>
    </header>
  );
}

function ExerciseView({
  exercise,
  signs,
  onAnswer,
  disabled,
}: {
  exercise: Exercise;
  signs: SignRecord;
  onAnswer: (correct: boolean) => void;
  disabled: boolean;
}) {
  switch (exercise.type) {
    case "multiple_choice": {
      const sign = signs[exercise.signId];
      if (!sign) return null;
      return (
        <MultipleChoice
          exercise={exercise}
          sign={sign}
          onAnswer={onAnswer}
          disabled={disabled}
        />
      );
    }
    case "match_pairs": {
      const pairSigns = exercise.pairs
        .map((p) => ({ sign: signs[p.signId], translation: p.translation }))
        .filter((p): p is { sign: Sign; translation: string } => !!p.sign);
      return (
        <MatchPairs
          exercise={exercise}
          pairs={pairSigns}
          onAnswer={onAnswer}
          disabled={disabled}
        />
      );
    }
    case "type_word": {
      const sign = signs[exercise.signId];
      if (!sign) return null;
      return (
        <TypeWord
          exercise={exercise}
          sign={sign}
          onAnswer={onAnswer}
          disabled={disabled}
        />
      );
    }
  }
}

function FeedbackBar({
  kind,
  message,
  onNext,
  submitting,
  isLast,
}: {
  kind: "correct" | "wrong";
  message?: string;
  onNext: () => void;
  submitting: boolean;
  isLast: boolean;
}) {
  const isCorrect = kind === "correct";
  return (
    <div
      role="status"
      className={`sticky bottom-0 -mx-4 rounded-t-2xl border-t p-4 shadow-inner ${
        isCorrect
          ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950"
          : "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950"
      }`}
    >
      <div className="flex items-center justify-between gap-4">
        <p className="font-semibold">
          {isCorrect ? "✅" : "❌"} {message}
        </p>
        <button
          type="button"
          onClick={onNext}
          disabled={submitting}
          className={`rounded-full px-6 py-2 font-semibold text-white shadow-sm disabled:opacity-60 ${
            isCorrect ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"
          }`}
        >
          {submitting ? "Guardando…" : isLast ? "Terminar" : "Siguiente"}
        </button>
      </div>
    </div>
  );
}

function OutOfHearts({ onExit }: { onExit: () => void }) {
  return (
    <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
      <div className="text-5xl">💔</div>
      <h1 className="text-2xl font-bold">Te has quedado sin corazones</h1>
      <p className="text-slate-600 dark:text-slate-400">
        Los corazones se regenerarán en un rato. Vuelve al panel y repasa
        lecciones que ya dominas para no perder la racha.
      </p>
      <button
        type="button"
        onClick={onExit}
        className="rounded-full bg-brand-600 px-6 py-2 font-semibold text-white hover:bg-brand-700"
      >
        Volver al panel
      </button>
    </div>
  );
}

function Result({
  result,
  onContinue,
}: {
  result: { xp: number; bestScore: number; perfected: boolean };
  onContinue: () => void;
}) {
  return (
    <div className="mx-auto max-w-md space-y-4 rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900">
      <div className="text-5xl">{result.perfected ? "🏆" : "🎉"}</div>
      <h1 className="text-2xl font-bold">
        {result.perfected ? "¡Lección perfecta!" : "¡Lección completada!"}
      </h1>
      <dl className="grid grid-cols-2 gap-2 text-left">
        <dt className="text-slate-500">XP ganada</dt>
        <dd className="text-right font-semibold">+{result.xp}</dd>
        <dt className="text-slate-500">Puntuación</dt>
        <dd className="text-right font-semibold">{result.bestScore}%</dd>
      </dl>
      <button
        type="button"
        onClick={onContinue}
        className="w-full rounded-full bg-brand-600 px-6 py-2 font-semibold text-white hover:bg-brand-700"
      >
        Continuar
      </button>
    </div>
  );
}
