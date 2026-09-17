"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CameraFeed } from "@/components/camera/CameraFeed";
import { HandOverlay } from "@/components/camera/HandOverlay";
import { PerfBadge } from "@/components/camera/PerfBadge";
import { HandTracker } from "@/lib/mediapipe/handTracker";
import type { HandFrame, PerfStats } from "@/lib/mediapipe/types";
import { extractFeatures } from "@/lib/recognition/features";
import {
  clearLocalTemplates,
  exportLocalTemplatesAsJson,
  listLetters,
  localTemplateCounts,
  saveLocalTemplate,
} from "@/lib/recognition/templates";

export function CaptureView() {
  const trackerRef = useRef<HandTracker | null>(null);
  const rafRef = useRef<number | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);

  const [frame, setFrame] = useState<HandFrame | null>(null);
  const [stats, setStats] = useState<PerfStats>({ fps: 0, p50: 0, p95: 0, samples: 0 });
  const [delegate, setDelegate] = useState<"GPU" | "CPU" | "loading">("loading");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [notice, setNotice] = useState<string | null>(null);

  const letters = useMemo(() => listLetters(), []);

  useEffect(() => {
    setCounts(localTemplateCounts());
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      trackerRef.current?.close();
      trackerRef.current = null;
    };
  }, []);

  const onCameraReady = useCallback(async (video: HTMLVideoElement) => {
    videoElRef.current = video;
    if (!trackerRef.current) {
      try {
        const tracker = new HandTracker();
        const { delegate } = await tracker.init();
        trackerRef.current = tracker;
        setDelegate(delegate);
      } catch (err) {
        setNotice(
          `No se pudo cargar el modelo: ${err instanceof Error ? err.message : "error"}`,
        );
        return;
      }
    }
    const step = () => {
      const tracker = trackerRef.current;
      const v = videoElRef.current;
      if (!tracker || !v) return;
      if (v.readyState >= 2) {
        const detected = tracker.detect(v, performance.now());
        setFrame(detected);
        setStats(tracker.stats());
      }
      rafRef.current = requestAnimationFrame(step);
    };
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
  }, []);

  const capture = useCallback(
    (letter: string) => {
      if (!frame) {
        setNotice("No hay mano detectada todavía.");
        return;
      }
      const features = extractFeatures(frame.normalized);
      saveLocalTemplate(letter, features);
      setCounts(localTemplateCounts());
      setNotice(`Plantilla capturada para «${letter}».`);
    },
    [frame],
  );

  const downloadJson = useCallback(() => {
    const merged = exportLocalTemplatesAsJson();
    const blob = new Blob([JSON.stringify(merged, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "fingerspelling.json";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }, []);

  const clearAll = useCallback(() => {
    if (!confirm("¿Borrar todas las plantillas locales?")) return;
    clearLocalTemplates();
    setCounts({});
    setNotice("Plantillas locales borradas.");
  }, []);

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-3">
        <CameraFeed
          onReady={onCameraReady}
          overlay={
            <HandOverlay
              videoRef={videoElRef as React.RefObject<HTMLVideoElement | null>}
              frame={frame}
            />
          }
        />
        <PerfBadge stats={stats} delegate={delegate} />
        {notice && (
          <p className="text-sm text-slate-600 dark:text-slate-300">{notice}</p>
        )}
      </div>

      <aside className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">Letras · plantillas locales</h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={downloadJson}
              className="rounded-full bg-brand-600 px-3 py-1 text-xs font-semibold text-white hover:bg-brand-700"
            >
              Descargar JSON
            </button>
            <button
              type="button"
              onClick={clearAll}
              className="rounded-full border border-red-300 px-3 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-950"
            >
              Vaciar
            </button>
          </div>
        </div>
        <ul className="grid max-h-[520px] grid-cols-3 gap-1.5 overflow-auto">
          {letters.map((letter) => {
            const n = counts[letter] ?? 0;
            return (
              <li key={letter}>
                <button
                  type="button"
                  onClick={() => capture(letter)}
                  className="flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm hover:border-brand-400 dark:border-slate-800 dark:bg-slate-900"
                >
                  <span className="font-mono font-bold">{letter}</span>
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                      n >= 3
                        ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
                        : n > 0
                          ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
                          : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                  >
                    {n}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
        <p className="text-xs text-slate-500">
          Al menos 3 plantillas por letra para que la clasificación sea estable.
          Las plantillas se guardan en <code>localStorage</code>.
        </p>
      </aside>
    </div>
  );
}
