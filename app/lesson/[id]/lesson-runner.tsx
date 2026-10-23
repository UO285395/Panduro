"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import dynamic from "next/dynamic";
import type { Exercise, Lesson, Sign } from "@/lib/curriculum/schema";
import { HeartsBar } from "@/components/gamification/HeartsBar";
import { completeLesson } from "@/lib/progress/completeLesson";
import { MAX_HEARTS } from "@/lib/gamification/xp";
import { MultipleChoice } from "@/components/exercises/MultipleChoice";
import { MatchPairs } from "@/components/exercises/MatchPairs";
import { TypeWord } from "@/components/exercises/TypeWord";
import { SignThis } from "@/components/exercises/SignThis";
import { MotionThis } from "@/components/exercises/MotionThis";
import { SignWord } from "@/components/exercises/SignWord";
import { PickSign } from "@/components/exercises/PickSign";
import { LearnCard } from "@/components/lesson/LearnCard";
import type { HandMood } from "@/components/mascot/HandMascot";
import { Icon } from "@/components/ui/Icon";
import { isRetryable, planLesson, type LessonStep } from "@/lib/lesson/plan";

const HandMascot = dynamic(
  () => import("@/components/mascot/HandMascot").then((m) => ({ default: m.HandMascot })),
  { ssr: false },
);

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
  // Presentaciones intercaladas y, al final, los fallos para repetir una vez.
  const [steps, setSteps] = useState<LessonStep[]>(() =>
    planLesson(lesson, new Set(Object.keys(signs).filter((id) => signs[id]))),
  );
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
  // La puntuación cuenta el primer intento de cada ejercicio; las repeticiones son práctica.
  const total = lesson.exercises.length;
  const currentStep = steps[step]!;
  const current = currentStep.kind === "exercise" ? currentStep.exercise : null;
  const retrying = currentStep.kind === "exercise" && currentStep.retry;
  const heartsLeft = Math.max(0, MAX_HEARTS - heartsUsed);
  const outOfHearts = heartsLeft === 0;

  function onAnswer(isCorrect: boolean) {
    if (!current) return;
    if (isCorrect) {
      if (!retrying) setCorrect((c) => c + 1);
      setFeedback({ kind: "correct", message: retrying ? "¡Ahora sí!" : "¡Correcto!" });
    } else {
      // Los ejercicios de cámara no consumen corazones ni se repiten: el ruido óptico
      // puede provocar falsos negativos que frustrarían al estudiante sin motivo.
      const consumes = isRetryable(current);
      if (consumes && !retrying) {
        setHeartsUsed((h) => h + 1);
        setSteps((all) => [...all, { kind: "exercise", exercise: current, retry: true }]);
      }
      setFeedback({
        kind: "wrong",
        message: !consumes
          ? "No se reconoció bien. Vamos a otra."
          : retrying
            ? "Repásalo en el glosario cuando acabes."
            : "Casi. Lo repetirás al final.",
      });
    }
  }

  function onNext() {
    setFeedback(null);
    if (step + 1 < steps.length) {
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
        learned={lesson.signs.map((id) => signs[id]).filter((x): x is Sign => !!x)}
        onContinue={() => {
          router.push("/dashboard");
          router.refresh();
        }}
      />
    );
  }

  // La mano solo asoma con el resultado: pulgar arriba o abajo.
  const mood: HandMood = feedback?.kind === "correct" ? "correct" : feedback ? "incorrect" : "idle";

  return (
    <div className="space-y-6">
      <Header
        title={lesson.title}
        step={step}
        total={steps.length}
        heartsLeft={heartsLeft}
      />

      {retrying && (
        <p className="chip bg-accent-100 text-accent-700 dark:bg-accent-700/30 dark:text-accent-100">
          <Icon name="repeat" size={16} /> Repaso: este lo fallaste antes
        </p>
      )}

      {currentStep.kind === "learn" ? (
        signs[currentStep.signId] ? (
          <LearnCard key={`learn-${step}`} sign={signs[currentStep.signId]!} onContinue={onNext} />
        ) : null
      ) : (
        <ExerciseView
          key={`${currentStep.exercise.id}-${step}`}
          exercise={currentStep.exercise}
          signs={signs}
          onAnswer={onAnswer}
          disabled={feedback !== null}
        />
      )}

      {feedback && (
        <FeedbackBar
          kind={feedback.kind}
          message={feedback.message}
          onNext={onNext}
          submitting={submitting}
          isLast={step + 1 === steps.length}
        />
      )}

      <div
        aria-hidden
        className={`pointer-events-none fixed -bottom-2 left-[max(0rem,calc(50%-22.5rem))] z-50 transition-[transform,opacity] duration-300 ease-out ${
          feedback ? "translate-y-0 opacity-100" : "translate-y-[110%] opacity-0"
        }`}
      >
        <HandMascot mood={mood} size={140} />
      </div>
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
    <header className="sticky top-0 z-30 -mx-4 space-y-1 bg-[color:var(--background)] px-4 pb-3 pt-3">
      <div className="flex items-center gap-3">
        <Link href="/dashboard" aria-label="Salir de la lección" className="icon-btn -ml-2">
          <Icon name="close" size={22} />
        </Link>
        <div
          className="h-4 flex-1 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800"
          role="progressbar"
          aria-valuenow={pct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progreso de la lección"
        >
          <div
            className="relative h-full rounded-full bg-petrol-500 transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(pct, 4)}%` }}
          >
            {/* Brillo de la barra, como una ficha. */}
            <span className="absolute inset-x-2 top-1 h-1 rounded-full bg-white/30" />
          </div>
        </div>
        <HeartsBar hearts={heartsLeft} />
      </div>
      <p className="truncate pl-10 text-sm font-medium text-slate-500 dark:text-slate-400">{title}</p>
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
    case "pick_sign": {
      const sign = signs[exercise.signId];
      const options = exercise.options.map((id) => signs[id]).filter((x): x is Sign => !!x);
      if (!sign || options.length < 2) return null;
      return (
        <PickSign exercise={exercise} sign={sign} options={options} onAnswer={onAnswer} disabled={disabled} />
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
    case "sign_this": {
      return (
        <SignThis
          exercise={exercise}
          onAnswer={onAnswer}
          disabled={disabled}
        />
      );
    }
    case "motion_this": {
      const sign = signs[exercise.signId];
      return (
        <MotionThis
          exercise={exercise}
          sign={sign}
          onAnswer={onAnswer}
          disabled={disabled}
        />
      );
    }
    case "sign_word": {
      const sign = signs[exercise.signId];
      return (
        <SignWord
          exercise={exercise}
          sign={sign}
          lessonSigns={Object.keys(signs)}
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
      className={`fixed inset-x-0 bottom-0 z-40 border-t-2 pb-[env(safe-area-inset-bottom)] ${
        isCorrect
          ? "border-petrol-200 bg-petrol-50 text-petrol-800 dark:border-petrol-800 dark:bg-petrol-950 dark:text-petrol-100"
          : "border-ko-200 bg-ko-50 text-ko-700 dark:border-ko-800 dark:bg-ko-950 dark:text-ko-100"
      }`}
    >
      <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-x-4 gap-y-3 py-4 pl-32 pr-4 sm:pl-36">
        <p className="min-w-0 flex-1 font-display text-xl font-extrabold leading-tight">{message}</p>
        <button
          type="button"
          onClick={onNext}
          disabled={submitting}
          autoFocus
          className={`${isCorrect ? "btn-ok" : "btn-ko"} w-full sm:w-auto sm:min-w-40`}
        >
          {submitting ? "Guardando…" : isLast ? "Terminar" : "Continuar"}
        </button>
      </div>
    </div>
  );
}

function OutOfHearts({ onExit }: { onExit: () => void }) {
  return (
    <div className="card mx-auto max-w-md space-y-4 p-8 text-center">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-ko-50 text-ko-500 dark:bg-ko-950">
        <Icon name="heart" size={44} />
      </div>
      <h1 className="text-3xl font-extrabold">Te has quedado sin corazones</h1>
      <p className="text-slate-600 dark:text-slate-400">
        Los corazones se regeneran en un rato. Mientras, repasa las lecciones que ya dominas para no
        perder la racha.
      </p>
      <button type="button" onClick={onExit} className="btn-primary w-full">
        Volver al panel
      </button>
    </div>
  );
}

function Result({
  result,
  learned,
  onContinue,
}: {
  result: { xp: number; bestScore: number; perfected: boolean };
  learned: Sign[];
  onContinue: () => void;
}) {
  return (
    <div className="mx-auto max-w-md space-y-6 pt-4 text-center">
      <div className="flex justify-center">
        <HandMascot mood="celebrate" size={200} />
      </div>
      <h1 className="text-4xl font-extrabold text-brand-600 dark:text-brand-400">
        {result.perfected ? "¡Lección perfecta!" : "¡Lección completada!"}
      </h1>
      <dl className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border-2 border-accent-500 bg-accent-100 p-3 dark:bg-accent-700/20">
          <dt className="font-display text-sm font-bold uppercase tracking-wider text-accent-700 dark:text-accent-100">
            XP ganada
          </dt>
          <dd className="flex items-center justify-center gap-1.5 font-display text-3xl font-extrabold text-accent-700 dark:text-accent-100">
            <Icon name="star" size={24} />+{result.xp}
          </dd>
        </div>
        <div className="rounded-2xl border-2 border-petrol-400 bg-petrol-50 p-3 dark:bg-petrol-950">
          <dt className="font-display text-sm font-bold uppercase tracking-wider text-petrol-700 dark:text-petrol-200">
            Puntuación
          </dt>
          <dd className="font-display text-3xl font-extrabold text-petrol-700 dark:text-petrol-100">
            {result.bestScore}%
          </dd>
        </div>
      </dl>
      {learned.length > 0 && (
        <div className="space-y-2 text-left">
          <h2 className="text-lg font-bold text-slate-600 dark:text-slate-300">Signos de esta lección</h2>
          <ul className="flex flex-wrap gap-2">
            {learned.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/glossary/${s.id}`}
                  className="chip border-2 border-slate-200 bg-white text-slate-700 hover:border-brand-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {s.translation}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
      <button type="button" onClick={onContinue} className="btn-primary w-full">
        Continuar
      </button>
    </div>
  );
}
