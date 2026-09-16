"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CameraFeed } from "@/components/camera/CameraFeed";
import { HandOverlay } from "@/components/camera/HandOverlay";
import { PerfBadge } from "@/components/camera/PerfBadge";
import { HandTracker } from "@/lib/mediapipe/handTracker";
import type { HandFrame, PerfStats } from "@/lib/mediapipe/types";
import type { Exercise } from "@/lib/curriculum/schema";
import { extractFeatures } from "@/lib/recognition/features";
import { KnnClassifier } from "@/lib/recognition/knn";
import {
  getLetterMeta,
  loadGlobalTemplates,
  loadLocalTemplates,
  saveLocalTemplate,
} from "@/lib/recognition/templates";

const MIN_TEMPLATES_PER_LETTER = 3;

type Props = {
  exercise: Extract<Exercise, { type: "sign_this" }>;
  onAnswer: (correct: boolean) => void;
  disabled: boolean;
};

type Phase =
  | { kind: "await_camera" }
  | { kind: "calibrating"; captured: number }
  | { kind: "evaluating"; startedAt: number }
  | { kind: "done"; correct: boolean };

export function SignThis({ exercise, onAnswer, disabled }: Props) {
  const trackerRef = useRef<HandTracker | null>(null);
  const rafRef = useRef<number | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const lastCaptureRef = useRef<number>(0);
  const captureCooldownMs = 700;

  const meta = getLetterMeta(exercise.letterId);
  const [phase, setPhase] = useState<Phase>({ kind: "await_camera" });
  const [frame, setFrame] = useState<HandFrame | null>(null);
  const [stats, setStats] = useState<PerfStats>({ fps: 0, p50: 0, p95: 0, samples: 0 });
  const [delegate, setDelegate] = useState<"GPU" | "CPU" | "loading">("loading");
  const [templatesTick, setTemplatesTick] = useState(0);

  const classifier = useMemo(() => {
    // Se recalcula cuando `templatesTick` cambia (tras cada saveLocalTemplate).
    void templatesTick;
    return new KnnClassifier(
      [...loadGlobalTemplates(), ...loadLocalTemplates()],
      5,
    );
  }, [templatesTick]);

  const availableTemplates = useMemo(
    () => classifier.countFor(exercise.letterId),
    [classifier, exercise.letterId],
  );

  // Buffer de votos para la fase de evaluación.
  const votesRef = useRef<{ label: string; confidence: number }[]>([]);

  const finishEvaluation = useCallback(() => {
    const votes = votesRef.current;
    if (votes.length === 0) {
      setPhase({ kind: "done", correct: false });
      onAnswer(false);
      return;
    }
    const counts = new Map<string, { n: number; conf: number }>();
    for (const v of votes) {
      const c = counts.get(v.label) ?? { n: 0, conf: 0 };
      c.n += 1;
      c.conf += v.confidence;
      counts.set(v.label, c);
    }
    let winner = "";
    let winnerCount = -1;
    for (const [label, c] of counts) {
      if (c.n > winnerCount) {
        winner = label;
        winnerCount = c.n;
      }
    }
    const winnerAvg = (counts.get(winner)?.conf ?? 0) / Math.max(1, winnerCount);
    const correct =
      winner === exercise.letterId && winnerAvg >= exercise.minConfidence;
    setPhase({ kind: "done", correct });
    onAnswer(correct);
  }, [exercise.letterId, exercise.minConfidence, onAnswer]);

  const step = useCallback(() => {
    const tracker = trackerRef.current;
    const video = videoElRef.current;
    if (!tracker || !video) return;
    if (video.readyState >= 2) {
      const now = performance.now();
      const detected = tracker.detect(video, now);
      setFrame(detected);
      setStats(tracker.stats());

      // Fase actual:
      setPhase((prev) => {
        if (!detected) return prev;
        if (prev.kind === "calibrating") {
          if (now - lastCaptureRef.current < captureCooldownMs) return prev;
          lastCaptureRef.current = now;
          const features = extractFeatures(detected.normalized);
          saveLocalTemplate(exercise.letterId, features);
          const captured = prev.captured + 1;
          if (captured >= MIN_TEMPLATES_PER_LETTER) {
            // Refresca clasificador y pasa a evaluación.
            setTemplatesTick((t) => t + 1);
            return { kind: "evaluating", startedAt: now };
          }
          return { kind: "calibrating", captured };
        }
        if (prev.kind === "evaluating") {
          const features = extractFeatures(detected.normalized);
          const pred = classifier.predict(features);
          if (pred) votesRef.current.push({ label: pred.label, confidence: pred.confidence });
          if (now - prev.startedAt >= exercise.voteWindowMs) {
            // Terminar en el siguiente tick sincrónico:
            queueMicrotask(finishEvaluation);
            return { kind: "done", correct: false };
          }
          return prev;
        }
        return prev;
      });
    }
    rafRef.current = requestAnimationFrame(step);
  }, [
    classifier,
    exercise.letterId,
    exercise.voteWindowMs,
    finishEvaluation,
  ]);

  const startCameraAndModel = useCallback(async (video: HTMLVideoElement) => {
    videoElRef.current = video;
    if (!trackerRef.current) {
      try {
        const tracker = new HandTracker();
        const { delegate } = await tracker.init();
        trackerRef.current = tracker;
        setDelegate(delegate);
      } catch {
        setDelegate("loading");
        setPhase({ kind: "done", correct: false });
        onAnswer(false);
        return;
      }
    }
    votesRef.current = [];
    if (availableTemplates < MIN_TEMPLATES_PER_LETTER) {
      setPhase({ kind: "calibrating", captured: 0 });
    } else {
      setPhase({ kind: "evaluating", startedAt: performance.now() });
    }
    step();
  }, [availableTemplates, onAnswer, step]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      trackerRef.current?.close();
      trackerRef.current = null;
    };
  }, []);

  const banner = renderBanner({
    phase,
    letterId: exercise.letterId,
    voteWindowMs: exercise.voteWindowMs,
    availableTemplates,
  });

  return (
    <section className="space-y-4" aria-labelledby={`ex-${exercise.id}`}>
      <div className="space-y-2">
        <h2 id={`ex-${exercise.id}`} className="text-lg font-semibold">
          {exercise.prompt}
        </h2>
        <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
          <div
            aria-hidden
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-brand-100 text-3xl font-bold text-brand-700 dark:bg-brand-900/40 dark:text-brand-100"
          >
            {exercise.letterId}
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {meta?.description ?? "Signa esta letra en el aire con una mano."}
          </p>
        </div>
      </div>

      <CameraFeed
        onReady={startCameraAndModel}
        onStop={() => {
          if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
          setPhase({ kind: "await_camera" });
        }}
        overlay={
          <HandOverlay
            videoRef={videoElRef as React.RefObject<HTMLVideoElement | null>}
            frame={frame}
          />
        }
      />

      {banner}

      <PerfBadge stats={stats} delegate={delegate} />

      {phase.kind === "done" && !disabled && (
        <p className="text-sm text-slate-500">
          Los ejercicios de cámara no consumen corazones — el ruido visual puede
          confundir al clasificador.
        </p>
      )}
    </section>
  );
}

function renderBanner({
  phase,
  letterId,
  voteWindowMs,
  availableTemplates,
}: {
  phase: Phase;
  letterId: string;
  voteWindowMs: number;
  availableTemplates: number;
}) {
  if (phase.kind === "await_camera") {
    return (
      <p className="text-sm text-slate-500">
        Pulsa «Empezar cámara» y luego signa la letra <b>{letterId}</b>. Tienes{" "}
        {(voteWindowMs / 1000).toFixed(1)} s para hacerla.
      </p>
    );
  }
  if (phase.kind === "calibrating") {
    return (
      <div
        role="status"
        className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100"
      >
        <strong>Calibrando</strong> la letra <b>{letterId}</b> (
        {availableTemplates} plantilla{availableTemplates === 1 ? "" : "s"}{" "}
        conocida{availableTemplates === 1 ? "" : "s"}). Mantén la letra 3 veces
        seguidas — {MIN_TEMPLATES_PER_LETTER - phase.captured} restante
        {MIN_TEMPLATES_PER_LETTER - phase.captured === 1 ? "" : "s"}.
      </div>
    );
  }
  if (phase.kind === "evaluating") {
    return (
      <div
        role="status"
        className="rounded-lg border border-brand-300 bg-brand-50 p-3 text-sm text-brand-900 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-100"
      >
        Reconociendo… signa <b>{letterId}</b>.
      </div>
    );
  }
  return (
    <div
      role="status"
      className={`rounded-lg border p-3 text-sm ${
        phase.correct
          ? "border-green-500 bg-green-50 text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-100"
          : "border-red-500 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100"
      }`}
    >
      {phase.correct
        ? `¡Reconocido! Has signado ${letterId}.`
        : `No se ha reconocido claramente. Vuelve a intentarlo.`}
    </div>
  );
}
