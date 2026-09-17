"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AvatarClip } from "@/lib/curriculum/schema";
import { AvatarPlayer } from "@/components/avatar/AvatarPlayer";
import { markOnboardingCompleted } from "@/lib/progress/actions";
import { markOnboardingCompletedDemo } from "@/lib/storage/demoStore";

type Props = {
  helloClip: AvatarClip | null;
  demo?: boolean;
};

const STEPS = [
  {
    title: "¡Bienvenida a Panduro!",
    body: "Aprenderás Lengua de Signos Española (LSE) con lecciones cortas, feedback por cámara y repetición espaciada. Todo directamente desde tu navegador.",
  },
  {
    title: "Corazones, XP y racha",
    body: "Tienes 5 corazones por sesión. Fallar en un ejercicio consume uno, pero los ejercicios con cámara nunca te penalizan. Los corazones se regeneran cada 30 minutos.",
  },
];

export function OnboardingView({ helloClip, demo }: Props) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();

  function finish() {
    if (demo) {
      markOnboardingCompletedDemo();
      router.replace("/dashboard");
      return;
    }
    startTransition(async () => {
      await markOnboardingCompleted();
      router.replace("/dashboard");
      router.refresh();
    });
  }

  const current = STEPS[step]!;
  const isLast = step === STEPS.length - 1;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      <AvatarPlayer clip={helloClip} label="HOLA" size={220} />
      <div className="space-y-3">
        <h1 className="text-2xl font-bold">{current.title}</h1>
        <p className="text-slate-600 dark:text-slate-400">{current.body}</p>
      </div>

      <div className="flex items-center gap-2" aria-label="Paso">
        {STEPS.map((_, i) => (
          <span
            key={i}
            aria-hidden
            className={`h-2 w-2 rounded-full ${i === step ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700"}`}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => (isLast ? finish() : setStep(step + 1))}
        disabled={pending}
        className="rounded-full bg-brand-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-brand-700 disabled:opacity-60"
      >
        {pending ? "Empezando…" : isLast ? "Empezar" : "Siguiente"}
      </button>
    </main>
  );
}
