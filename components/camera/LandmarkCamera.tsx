"use client";

import { useEffect, useRef, useState } from "react";
import type { LandmarkFrame } from "@/lib/esku/domain/landmarks/value-objects/LandmarkFrame";
import { drawFrame } from "@/lib/recognition/drawFrame";
import { createLandmarkSource } from "@/lib/recognition/engine";

type Props = {
  /** Cada fotograma con manos, pose y cara mientras la cámara está activa. */
  onFrame: (frame: LandmarkFrame) => void;
  /** Lo que el ejercicio necesite cargar (pesos) antes de abrir la cámara. */
  prepare?: () => Promise<void>;
  onStart?: () => void;
  /** Cuando pasa a true se apaga la cámara (p. ej. al terminar el ejercicio). */
  stop?: boolean;
  disabled?: boolean;
};

type Status = "idle" | "loading" | "running" | "error";

export function LandmarkCamera({ onFrame, prepare, onStart, stop, disabled }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const sourceRef = useRef<ReturnType<typeof createLandmarkSource> | null>(null);
  const onFrameRef = useRef(onFrame);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    onFrameRef.current = onFrame;
  });

  useEffect(() => () => sourceRef.current?.stop(), []);

  useEffect(() => {
    if (stop && sourceRef.current?.isRunning()) {
      sourceRef.current.stop();
      drawFrame(canvasRef.current, videoRef.current, null);
      setStatus("idle");
    }
  }, [stop]);

  async function start() {
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    setStatus("loading");
    try {
      const source = (sourceRef.current ??= createLandmarkSource(video));
      await Promise.all([source.load(), prepare?.()]);
      await source.start((frame) => {
        drawFrame(canvasRef.current, videoRef.current, frame);
        onFrameRef.current(frame);
      });
      setStatus("running");
      onStart?.();
    } catch (e) {
      setStatus("error");
      setError(
        e instanceof Error && e.name === "CameraUnavailableError"
          ? "No hay cámara disponible o se denegó el permiso."
          : e instanceof Error
            ? e.message
            : "No se pudo abrir la cámara.",
      );
    }
  }

  const running = status === "running";

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-2xl bg-slate-900">
        <video
          ref={videoRef}
          playsInline
          muted
          aria-label="Vista previa de tu cámara"
          className={`block h-auto w-full -scale-x-100 ${running ? "" : "hidden"}`}
        />
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100" />
        {!running && (
          <div className="flex aspect-video flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-200">
            {status === "loading" ? (
              <p>Preparando la cámara y los modelos (la primera vez tarda unos segundos)…</p>
            ) : (
              <button
                type="button"
                onClick={start}
                disabled={disabled || stop}
                className="rounded-full bg-brand-600 px-5 py-2 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Empezar cámara
              </button>
            )}
          </div>
        )}
      </div>
      {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-slate-500">
        La imagen no sale de tu dispositivo: el reconocimiento se hace en el navegador.
      </p>
    </div>
  );
}
