"use client";

import { useEffect, useRef, useState } from "react";
import { CameraFeed } from "@/components/camera/CameraFeed";
import { HandOverlay } from "@/components/camera/HandOverlay";
import { PerfBadge } from "@/components/camera/PerfBadge";
import { HandTracker } from "@/lib/mediapipe/handTracker";
import type { HandFrame, PerfStats } from "@/lib/mediapipe/types";

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
        // Solo actualizamos si hay algo nuevo para minimizar renders.
        if (detected) setFrame(detected);
        else setFrame(null);
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
    </div>
  );
}
