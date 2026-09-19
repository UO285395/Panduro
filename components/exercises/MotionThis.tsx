"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CameraFeed } from "@/components/camera/CameraFeed";
import { HandOverlay } from "@/components/camera/HandOverlay";
import { PerfBadge } from "@/components/camera/PerfBadge";
import { AvatarPlayer } from "@/components/avatar/AvatarPlayer";
import { HandTracker } from "@/lib/mediapipe/handTracker";
import type { HandFrame, PerfStats } from "@/lib/mediapipe/types";
import type { Exercise, Sign } from "@/lib/curriculum/schema";
import { MotionBuffer } from "@/lib/recognition/motion";
import type { MotionGesture } from "@/lib/recognition/motion";

type Props = {
  exercise: Extract<Exercise, { type: "motion_this" }>;
  sign: Sign | undefined;
  onAnswer: (correct: boolean) => void;
  disabled: boolean;
};

type Phase =
  | { kind: "await_camera" }
  | { kind: "evaluating"; startedAt: number }
  | { kind: "done"; correct: boolean };

const GESTURE_LABELS: Record<MotionGesture, string> = {
  WAVE_H: "ola horizontal (izquierda-derecha)",
  WAVE_V: "ola vertical (arriba-abajo)",
  PUSH_FORWARD: "empuje hacia adelante",
  NONE: "",
};

export function MotionThis({ exercise, sign, onAnswer, disabled }: Props) {
  const trackerRef = useRef<HandTracker | null>(null);
  const rafRef = useRef<number | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const motionBufferRef = useRef<MotionBuffer>(new MotionBuffer(1200));
  const detectedRef = useRef<boolean>(false);

  const [phase, setPhase] = useState<Phase>({ kind: "await_camera" });
  const [frame, setFrame] = useState<HandFrame | null>(null);
  const [stats, setStats] = useState<PerfStats>({ fps: 0, p50: 0, p95: 0, samples: 0 });
  const [delegate, setDelegate] = useState<"GPU" | "CPU" | "loading">("loading");

  const finishEvaluation = useCallback(
    (correct: boolean) => {
      setPhase({ kind: "done", correct });
      onAnswer(correct);
    },
    [onAnswer],
  );

  const step = useCallback(() => {
    const tracker = trackerRef.current;
    const video = videoElRef.current;
    if (!tracker || !video) return;
    if (video.readyState >= 2) {
      const now = performance.now();
      const detected = tracker.detect(video, now);
      setFrame(detected);
      setStats(tracker.stats());

      if (detected) {
        detectedRef.current = true;
        motionBufferRef.current.push(detected.normalized[0]!, now);
        const gesture = motionBufferRef.current.classify();
        if (gesture === exercise.gesture) {
          finishEvaluation(true);
          return;
        }
      }

      setPhase((prev) => {
        if (prev.kind === "evaluating" && now - prev.startedAt >= exercise.timeoutMs) {
          queueMicrotask(() => finishEvaluation(false));
          return { kind: "done", correct: false };
        }
        return prev;
      });
    }
    rafRef.current = requestAnimationFrame(step);
  }, [exercise.gesture, exercise.timeoutMs, finishEvaluation]);

  const startCameraAndModel = useCallback(
    async (video: HTMLVideoElement) => {
      videoElRef.current = video;
      if (!trackerRef.current) {
        try {
          const tracker = new HandTracker();
          const { delegate } = await tracker.init();
          trackerRef.current = tracker;
          setDelegate(delegate);
        } catch {
          setDelegate("loading");
          finishEvaluation(false);
          return;
        }
      }
      motionBufferRef.current.reset();
      detectedRef.current = false;
      setPhase({ kind: "evaluating", startedAt: performance.now() });
      step();
    },
    [finishEvaluation, step],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      trackerRef.current?.close();
      trackerRef.current = null;
    };
  }, []);

  const timeoutSec = (exercise.timeoutMs / 1000).toFixed(0);
  const gestureLabel = GESTURE_LABELS[exercise.gesture];

  return (
    <section className="space-y-4" aria-labelledby={`ex-${exercise.id}`}>
      <div className="space-y-2">
        <h2 id={`ex-${exercise.id}`} className="text-lg font-semibold">
          {exercise.prompt}
        </h2>
        <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
          {sign?.avatarClip && (
            <div className="shrink-0">
              <AvatarPlayer clip={sign.avatarClip} size={100} />
            </div>
          )}
          <div>
            <p className="font-semibold">{sign?.translation ?? exercise.signId}</p>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              Realiza un {gestureLabel} con la mano.
            </p>
          </div>
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

      {phase.kind === "await_camera" && (
        <p className="text-sm text-slate-500">
          Pulsa «Empezar cámara» y realiza el movimiento. Tienes {timeoutSec} s.
        </p>
      )}
      {phase.kind === "evaluating" && (
        <div
          role="status"
          className="rounded-lg border border-brand-300 bg-brand-50 p-3 text-sm text-brand-900 dark:border-brand-700 dark:bg-brand-950 dark:text-brand-100"
        >
          Detectando movimiento… realiza {gestureLabel}.
        </div>
      )}
      {phase.kind === "done" && (
        <div
          role="status"
          className={`rounded-lg border p-3 text-sm ${
            phase.correct
              ? "border-green-500 bg-green-50 text-green-900 dark:border-green-700 dark:bg-green-950 dark:text-green-100"
              : "border-red-500 bg-red-50 text-red-900 dark:border-red-700 dark:bg-red-950 dark:text-red-100"
          }`}
        >
          {phase.correct
            ? "¡Movimiento reconocido!"
            : "No se detectó el movimiento a tiempo. Inténtalo de nuevo."}
        </div>
      )}

      <PerfBadge stats={stats} delegate={delegate} />

      {phase.kind === "done" && !disabled && (
        <p className="text-sm text-slate-500">
          Los ejercicios de cámara no consumen corazones.
        </p>
      )}
    </section>
  );
}
