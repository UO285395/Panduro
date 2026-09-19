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
  const lastFrameRef = useRef<import("@/lib/mediapipe/types").HandFrame | null>(null);

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [delegate, setDelegate] = useState<"GPU" | "CPU" | "loading">("loading");
  const [frame, setFrame] = useState<HandFrame | null>(null);
  const [stats, setStats] = useState<PerfStats>({ fps: 0, p50: 0, p95: 0, samples: 0 });
  const [text, setText] = useState("");
  const [active, setActive] = useState<{ label: string; display: string; confidence: number } | null>(null);
  const [segPhase, setSegPhase] = useState<"idle" | "moving" | "holding">("idle");
  const [segStableMs, setSegStableMs] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<TranslationRow[]>(initialHistory);
  const [saving, setSaving] = useState(false);

  const classifier = useMemo(() => {
    const c = new KnnClassifier(
      [...loadGlobalTemplates(), ...loadLocalTemplates()],
      3,
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
        lastFrameRef.current = detected;

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
        const segState = seg.state();
        setSegPhase(segState.phase);
        setSegStableMs(segState.stableMs);

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

  function onCaptureNow() {
    const seg = segmenterRef.current;
    const asm = assemblerRef.current;
    const frame = lastFrameRef.current;
    if (!seg || !asm || !frame) return;
    const buf = seg.lastBuffer();
    const centroid = buf.length > 0 ? averageBuf(buf) : frame.normalized;
    const features = extractFeatures(centroid);
    const raw = classifierRef.current?.predict(features) ?? null;
    const pred = raw ? refineWithRules(raw, centroid) : null;
    if (pred && pred.confidence >= MIN_TRANSLATE_CONFIDENCE) {
      asm.consume({ label: pred.label, confidence: pred.confidence, at: Date.now() });
      cardIdsRef.current.push(
        /^[A-ZÑ]$/.test(pred.label) ? `letter:${pred.label}` : `sign:${pred.label}`,
      );
      const frameOut = asm.currentFrame(Date.now());
      setText(frameOut.text);
      setActive(frameOut.active);
    } else {
      setNotice(pred ? `Confianza baja: ${((pred.confidence ?? 0) * 100).toFixed(0)}%` : "Sin detección");
    }
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
            <div className="flex items-center gap-2">
              <p className="text-xs uppercase tracking-wider text-slate-500">
                Transcripción
              </p>
              {status === "recording" && (
                <span
                  className={`ml-auto rounded-full px-2 py-0.5 text-xs font-mono ${
                    segPhase === "holding"
                      ? "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300"
                      : segPhase === "moving"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                  }`}
                >
                  {segPhase === "holding"
                    ? `hold ${Math.min(segStableMs, 300).toFixed(0)} ms`
                    : segPhase === "moving"
                      ? "moviendo"
                      : "espera"}
                </span>
              )}
            </div>
            <p className="mt-1 text-lg font-medium">{text || "…"}</p>
            {active && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>
                    Último signo: <b>{active.display}</b> ({active.label})
                  </span>
                  <span className={confidenceTextClass(active.confidence)}>
                    {(active.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div
                    className={`h-full rounded-full transition-all duration-200 ${confidenceBarClass(active.confidence)}`}
                    style={{ width: `${Math.round(active.confidence * 100)}%` }}
                  />
                </div>
              </div>
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
              onClick={onCaptureNow}
              disabled={status !== "recording" || !lastFrameRef.current}
              title="Fuerza el reconocimiento del frame actual sin esperar la pausa de segmentación"
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Capturar ahora
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

function confidenceTextClass(c: number) {
  if (c < 0.40) return "text-red-600 dark:text-red-400";
  if (c < 0.70) return "text-amber-600 dark:text-amber-400";
  return "text-green-600 dark:text-green-400";
}

function confidenceBarClass(c: number) {
  if (c < 0.40) return "bg-red-500";
  if (c < 0.70) return "bg-amber-500";
  return "bg-green-500";
}

function averageBuf(
  frames: import("@/lib/mediapipe/types").NormalizedLandmark[][],
): import("@/lib/mediapipe/types").NormalizedLandmark[] {
  if (frames.length === 0) return [];
  const n = frames[0]!.length;
  const out: import("@/lib/mediapipe/types").NormalizedLandmark[] = new Array(n);
  for (let i = 0; i < n; i++) {
    let x = 0, y = 0, z = 0;
    for (const f of frames) { x += f[i]!.x; y += f[i]!.y; z += f[i]!.z; }
    out[i] = { x: x / frames.length, y: y / frames.length, z: z / frames.length };
  }
  return out;
}
