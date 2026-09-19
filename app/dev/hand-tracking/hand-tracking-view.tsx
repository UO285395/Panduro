"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CameraFeed } from "@/components/camera/CameraFeed";
import { HandOverlay } from "@/components/camera/HandOverlay";
import { PerfBadge } from "@/components/camera/PerfBadge";
import { HandTracker } from "@/lib/mediapipe/handTracker";
import type { HandFrame, PerfStats } from "@/lib/mediapipe/types";
import { extractFeatures } from "@/lib/recognition/features";
import { KnnClassifier } from "@/lib/recognition/knn";
import { refineWithRules } from "@/lib/recognition/rules";
import { loadGlobalTemplates, loadLocalTemplates } from "@/lib/recognition/templates";
import type { Prediction } from "@/lib/recognition/knn";

type LoadState = "idle" | "loading" | "ready" | "error";

export function HandTrackingView() {
  const trackerRef = useRef<HandTracker | null>(null);
  const rafRef = useRef<number | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [delegate, setDelegate] = useState<"GPU" | "CPU" | "loading">("loading");
  const [frame, setFrame] = useState<HandFrame | null>(null);
  const [stats, setStats] = useState<PerfStats>({
    fps: 0,
    p50: 0,
    p95: 0,
    samples: 0,
  });
  const [top3, setTop3] = useState<Prediction[]>([]);

  const classifier = useMemo(
    () => new KnnClassifier([...loadGlobalTemplates(), ...loadLocalTemplates()], 3),
    [],
  );

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      trackerRef.current?.close();
      trackerRef.current = null;
    };
  }, []);

  async function onCameraReady(video: HTMLVideoElement) {
    videoElRef.current = video;
    if (!trackerRef.current) {
      setLoadState("loading");
      try {
        const tracker = new HandTracker();
        const { delegate } = await tracker.init();
        trackerRef.current = tracker;
        setDelegate(delegate);
        setLoadState("ready");
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Fallo al cargar el modelo");
        setLoadState("error");
        return;
      }
    } else {
      setLoadState("ready");
    }
    loop();
  }

  function loop() {
    const tracker = trackerRef.current;
    const video = videoElRef.current;
    if (!tracker || !video) return;

    const step = () => {
      if (video.readyState >= 2) {
        const now = performance.now();
        const detected = tracker.detect(video, now);
        if (detected) {
          setFrame(detected);
          const features = extractFeatures(detected.normalized);
          const candidates = classifier.predictTopN(features, 3);
          const refined = candidates.map((c) => {
            const r = refineWithRules({ label: c.label, confidence: c.confidence, distance: c.distance }, detected.normalized);
            return r ?? c;
          });
          setTop3(refined);
        } else {
          setFrame(null);
          setTop3([]);
        }
        setStats(tracker.stats());
      }
      rafRef.current = requestAnimationFrame(step);
    };
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
  }

  function onCameraStop() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setFrame(null);
    setStats({ fps: 0, p50: 0, p95: 0, samples: 0 });
  }

  return (
    <div className="space-y-4">
      <CameraFeed
        onReady={onCameraReady}
        onStop={onCameraStop}
        overlay={
          loadState === "ready" ? (
            <HandOverlay
              videoRef={videoElRef as React.RefObject<HTMLVideoElement | null>}
              frame={frame}
            />
          ) : null
        }
      />

      {loadState === "loading" && (
        <p role="status" className="text-sm text-slate-500">
          Cargando modelo de hand tracking…
        </p>
      )}
      {loadState === "error" && (
        <p role="alert" className="text-sm text-red-600">
          No se pudo cargar el modelo: {loadError}
        </p>
      )}

      <PerfBadge stats={stats} delegate={delegate} />

      {top3.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Top candidatos
          </p>
          <div className="space-y-2">
            {top3.map((p) => (
              <div key={p.label} className="flex items-center gap-2">
                <span className="w-7 font-mono text-center text-sm font-bold text-brand-700 dark:text-brand-300">
                  {p.label}
                </span>
                <div className="flex-1 overflow-hidden rounded-full bg-slate-200 h-2 dark:bg-slate-700">
                  <div
                    className={`h-full rounded-full transition-all duration-150 ${
                      p.confidence >= 0.70
                        ? "bg-green-500"
                        : p.confidence >= 0.40
                          ? "bg-amber-500"
                          : "bg-red-500"
                    }`}
                    style={{ width: `${Math.round(p.confidence * 100)}%` }}
                  />
                </div>
                <span className="w-8 text-right text-xs tabular-nums text-slate-600 dark:text-slate-400">
                  {Math.round(p.confidence * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
