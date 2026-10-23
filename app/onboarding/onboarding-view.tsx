"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { AvatarClip } from "@/lib/curriculum/schema";
import { AvatarPlayer } from "@/components/avatar/AvatarPlayer";
import { Icon } from "@/components/ui/Icon";
import { markOnboardingCompleted } from "@/lib/progress/actions";
import { markOnboardingCompletedDemo } from "@/lib/storage/demoStore";

type Props = {
  helloClip: AvatarClip | null;
  demo?: boolean;
};

const STEPS = [
  {
    title: "¡Te damos la bienvenida a Panduro!",
    body: "Aprenderás Lengua de Signos Española (LSE) con lecciones cortas, la cámara para comprobar tus signos y repasos justo antes de olvidarlos. Todo desde el navegador.",
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
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-8 px-6 py-12 text-center">
      <div className="overflow-hidden rounded-[2rem] border-4 border-white bg-brand-100 shadow-[0_8px_0_0] shadow-brand-200 dark:border-slate-800 dark:bg-brand-900/40 dark:shadow-slate-950">
        <AvatarPlayer clip={helloClip} label="HOLA" size={240} />
      </div>
      <div className="space-y-3">
        <h1 className="text-3xl font-extrabold leading-tight">{current.title}</h1>
        <p className="text-slate-600 dark:text-slate-400">{current.body}</p>
      </div>

      {step === 1 && (
        <ul className="flex flex-wrap justify-center gap-2" aria-label="Lo que vas a ganar">
          <li className="chip bg-ko-50 text-ko-600 dark:bg-ko-950 dark:text-ko-300">
            <Icon name="heart" size={18} /> 5 corazones
          </li>
          <li className="chip bg-brand-50 text-brand-700 dark:bg-brand-950/50 dark:text-brand-200">
            <Icon name="star" size={18} /> XP
          </li>
          <li className="chip bg-accent-100 text-accent-700 dark:bg-accent-700/25 dark:text-accent-100">
            <Icon name="flame" size={18} /> Racha diaria
          </li>
        </ul>
      )}

      <div className="flex items-center gap-2" aria-label={`Paso ${step + 1} de ${STEPS.length}`}>
        {STEPS.map((_, i) => (
          <span
            key={i}
            aria-hidden
            className={`h-2.5 rounded-full transition-all ${i === step ? "w-8 bg-brand-500" : "w-2.5 bg-slate-300 dark:bg-slate-700"}`}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={() => (isLast ? finish() : setStep(step + 1))}
        disabled={pending}
        className="btn-primary w-full"
      >
        {pending ? "Empezando…" : isLast ? "Empezar" : "Siguiente"}
      </button>
    </main>
  );
}
