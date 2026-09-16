"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CameraFeed } from "@/components/camera/CameraFeed";
import { HandOverlay } from "@/components/camera/HandOverlay";
import { PerfBadge } from "@/components/camera/PerfBadge";
import { HandTracker } from "@/lib/mediapipe/handTracker";
import type { HandFrame, PerfStats } from "@/lib/mediapipe/types";
import { extractFeatures } from "@/lib/recognition/features";
import { KnnClassifier } from "@/lib/recognition/knn";
import { refineWithRules } from "@/lib/recognition/rules";
import {
  loadGlobalTemplates,
  loadLocalTemplates,
} from "@/lib/recognition/templates";
import { SegmentStream } from "@/lib/translator/segment";
import { TextAssembler } from "@/lib/translator/assembler";
import { MIN_TRANSLATE_CONFIDENCE } from "@/lib/translator/constants";
import { saveTranslation, listTranslations } from "@/lib/translator/persistence-client";
import type { TranslationRow } from "@/lib/translator/persistence";
import { HistoryPanel } from "./history-panel";

type Status = "idle" | "loading" | "recording" | "paused" | "error";

type Props = {
  initialHistory: TranslationRow[];
  demo?: boolean;
};

export function TranslateView({ initialHistory, demo }: Props) {
  const trackerRef = useRef<HandTracker | null>(null);
  const rafRef = useRef<number | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const segmenterRef = useRef<SegmentStream | null>(null);
  const assemblerRef = useRef<TextAssembler | null>(null);
  const classifierRef = useRef<KnnClassifier | null>(null);
  const cardIdsRef = useRef<string[]>([]);
  const startedAtRef = useRef<number>(0);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [delegate, setDelegate] = useState<"GPU" | "CPU" | "loading">("loading");
  const [frame, setFrame] = useState<HandFrame | null>(null);
  const [stats, setStats] = useState<PerfStats>({ fps: 0, p50: 0, p95: 0, samples: 0 });
  const [text, setText] = useState("");
  const [active, setActive] = useState<{ label: string; display: string; confidence: number } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<TranslationRow[]>(initialHistory);
  const [saving, setSaving] = useState(false);

  const classifier = useMemo(() => {
    const c = new KnnClassifier(
      [...loadGlobalTemplates(), ...loadLocalTemplates()],
      5,
    );
    classifierRef.current = c;
    return c;
  }, []);

  const initSession = useCallback(() => {
    segmenterRef.current = new SegmentStream();
    assemblerRef.current = new TextAssembler();
    cardIdsRef.current = [];
    startedAtRef.current = Date.now();
    setText("");
    setActive(null);
  }, []);

  const loop = useCallback(() => {
    const step = () => {
      const tracker = trackerRef.current;
      const video = videoRef.current;
      const seg = segmenterRef.current;
      const asm = assemblerRef.current;
      if (!tracker || !video || !seg || !asm) return;
      if (video.readyState >= 2) {
        const now = performance.now();
        const detected = tracker.detect(video, now);
        setFrame(detected);
        setStats(tracker.stats());

        const events = seg.push(detected, now);
        for (const evt of events) {
          if (evt.kind === "hold") {
            const features = extractFeatures(evt.centroid);
            const raw = classifier.predict(features);
            const pred = refineWithRules(raw, evt.centroid);
            if (pred && pred.confidence >= MIN_TRANSLATE_CONFIDENCE) {
              asm.consume({ label: pred.label, confidence: pred.confidence, at: Date.now() });
              cardIdsRef.current.push(
                /^[A-ZÑ]$/.test(pred.label) ? `letter:${pred.label}` : `sign:${pred.label}`,
              );
            }
          }
        }
        const nowClient = Date.now();
        const frameOut = asm.currentFrame(nowClient);
        setText(frameOut.text);
        setActive(frameOut.active);
      }
      rafRef.current = requestAnimationFrame(step);
    };
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
  }, [classifier]);

  const onCameraReady = useCallback(async (video: HTMLVideoElement) => {
    videoRef.current = video;
    if (!trackerRef.current) {
      setStatus("loading");
      try {
        const tracker = new HandTracker();
        const { delegate } = await tracker.init();
        trackerRef.current = tracker;
        setDelegate(delegate);
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo cargar el modelo");
        setStatus("error");
        return;
      }
    }
    initSession();
    setStatus("recording");
    loop();
  }, [initSession, loop]);

  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      trackerRef.current?.close();
      trackerRef.current = null;
    };
  }, []);

  function onCameraStop() {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    setStatus("paused");
    setFrame(null);
  }

  function onNewSentence() {
    assemblerRef.current?.reset();
    segmenterRef.current = new SegmentStream();
    cardIdsRef.current = [];
    startedAtRef.current = Date.now();
    setText("");
    setActive(null);
    setNotice(null);
  }

  async function onCopy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setNotice("Copiado al portapapeles");
    } catch {
      setNotice("No se pudo copiar");
    }
  }

  function onDownload() {
    if (!text) return;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `panduro-traduccion-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function onSave() {
    if (!text || saving) return;
    setSaving(true);
    try {
      await saveTranslation({
        text,
        cardIds: cardIdsRef.current,
        startedAt: startedAtRef.current || Date.now(),
        endedAt: Date.now(),
      });
      const next = await listTranslations(10);
      setHistory(next);
      setNotice("Guardado en tu historial");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
          Hito 7 · Práctica libre
        </p>
        <h1 className="text-2xl font-bold">Traductor de LSE en tiempo real</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Signa frente a la cámara y verás la transcripción a castellano. Solo
          se reconocen signos que el clasificador conoce (alfabeto calibrado y
          los signos léxicos que hayas capturado en{" "}
          <code>/dev/capture</code>).
        </p>
      </header>

      <div
        role="note"
        className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
      >
        La LSE tiene gramática propia. Esta transcripción es una aproximación
        gloss → castellano, no una traducción literal palabra-a-palabra.
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <CameraFeed
            onReady={onCameraReady}
            onStop={onCameraStop}
            overlay={
              status === "recording" ? (
                <HandOverlay
                  videoRef={videoRef as React.RefObject<HTMLVideoElement | null>}
                  frame={frame}
                />
              ) : null
            }
          />
          <PerfBadge stats={stats} delegate={delegate} />
          {status === "loading" && (
            <p role="status" className="text-sm text-slate-500">
              Cargando modelo…
            </p>
          )}
          {status === "error" && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <section
            aria-live="polite"
            className="min-h-[6rem] rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="text-xs uppercase tracking-wider text-slate-500">
              Transcripción
            </p>
            <p className="mt-1 text-lg font-medium">{text || "…"}</p>
            {active && (
              <p className="mt-2 text-xs text-slate-500">
                Último signo: <b>{active.display}</b> ({active.label}) ·{" "}
                {(active.confidence * 100).toFixed(0)}%
              </p>
            )}
          </section>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onNewSentence}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Nueva frase
            </button>
            <button
              type="button"
              onClick={onCopy}
              disabled={!text}
              className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-60"
            >
              Copiar
            </button>
            <button
              type="button"
              onClick={onDownload}
              disabled={!text}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Descargar .txt
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!text || saving}
              className="rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
          {notice && <p className="text-sm text-slate-600">{notice}</p>}
        </div>

        <aside className="space-y-3">
          <h2 className="text-sm font-semibold">Historial</h2>
          <HistoryPanel entries={history} />
          {demo && (
            <p className="text-xs text-slate-500">
              (Modo demo · las traducciones viven en este navegador.)
            </p>
          )}
        </aside>
      </div>
    </main>
  );
}
