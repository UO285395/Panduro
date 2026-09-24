"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RecognitionUpdate } from "@/lib/esku/application/use-cases/RecognizeSignsUseCase";
import {
  ARM_CONNECTIONS,
  isVisible,
  TORSO_CONNECTIONS,
} from "@/lib/esku/domain/landmarks/value-objects/BodyLandmarks";
import { HAND_CONNECTIONS, type Landmark } from "@/lib/esku/domain/landmarks/value-objects/Landmark";
import type { LandmarkFrame } from "@/lib/esku/domain/landmarks/value-objects/LandmarkFrame";
import { createGloss, type SignCandidate } from "@/lib/esku/domain/recognition/value-objects/Gloss";
import type { Transcript } from "@/lib/esku/domain/transcript/entities/Transcript";
import type { AvatarClip } from "@/lib/curriculum/schema";
import { createRecognizer, VOCABULARY_MANIFEST_URL, type Recognizer } from "@/lib/recognition/engine";
import { curriculumIdFor } from "@/lib/recognition/vocabularyMap";
import type { TranslationRow } from "@/lib/translator/persistence";
import { listTranslations, saveTranslation } from "@/lib/translator/persistence-client";
import { HistoryPanel } from "./history-panel";

const AvatarPlayer = dynamic(
  () => import("@/components/avatar/AvatarPlayer").then((m) => m.AvatarPlayer),
  { ssr: false, loading: () => null },
);

type Status = "idle" | "loading" | "running" | "error";

type Props = {
  initialHistory: TranslationRow[];
  demo?: boolean;
  clipsMap?: Record<string, AvatarClip | null>;
};

const SOURCE_LABEL: Record<SignCandidate["source"], string> = {
  alphabet: "letra",
  vocabulary: "signo",
  taught: "enseñado",
};

export function TranslateView({ initialHistory, demo, clipsMap = {} }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recognizerRef = useRef<Recognizer | null>(null);
  const lastTextRef = useRef("");
  const lastCandidatesRef = useRef("");

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [rearCamera, setRearCamera] = useState(false);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [candidates, setCandidates] = useState<readonly SignCandidate[]>([]);
  const [vocabulary, setVocabulary] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<TranslationRow[]>(initialHistory);
  const [saving, setSaving] = useState(false);

  const knownIds = useMemo(() => new Set(Object.keys(clipsMap)), [clipsMap]);
  const text = transcript?.toText() ?? "";
  const lastWord = [...(transcript?.entries ?? [])].reverse().find((e) => e.source !== "alphabet");
  const lastWordId = lastWord ? curriculumIdFor(lastWord.text, knownIds) : null;

  useEffect(() => {
    fetch(VOCABULARY_MANIFEST_URL)
      .then((r) => r.json() as Promise<{ concepts: string[]; abstentionConcept: string | null }>)
      .then((m) => {
        const words = new Set(
          m.concepts.filter((c) => c !== m.abstentionConcept).map((c) => createGloss(c).text),
        );
        setVocabulary([...words].sort((a, b) => a.localeCompare(b, "es")));
      })
      .catch(() => setVocabulary([]));
    return () => recognizerRef.current?.recognize.stop();
  }, []);

  function onUpdate(update: RecognitionUpdate) {
    drawFrame(canvasRef.current, videoRef.current, update.frame);
    const nextText = update.transcript.toText();
    if (nextText !== lastTextRef.current || update.transcript.isEmpty) {
      lastTextRef.current = nextText;
      setTranscript(update.transcript);
    }
    const top = update.candidates.slice(0, 3);
    const key = top.map((c) => `${c.gloss.id}:${c.confidence.toFixed(2)}`).join("|");
    if (key !== lastCandidatesRef.current) {
      lastCandidatesRef.current = key;
      setCandidates(top);
    }
  }

  async function start() {
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    setStatus("loading");
    try {
      const rec = (recognizerRef.current ??= createRecognizer(video));
      await rec.load();
      await rec.source.useCamera(rearCamera ? "environment" : "user");
      await rec.recognize.start(onUpdate);
      setStatus("running");
    } catch (e) {
      setStatus("error");
      setError(
        e instanceof Error && e.name === "CameraUnavailableError"
          ? "No hay cámara disponible o se denegó el permiso."
          : e instanceof Error
            ? e.message
            : "No se pudo iniciar el reconocimiento.",
      );
    }
  }

  function stop() {
    recognizerRef.current?.recognize.stop();
    drawFrame(canvasRef.current, videoRef.current, null);
    setCandidates([]);
    setStatus("idle");
  }

  async function switchCamera() {
    const next = !rearCamera;
    setRearCamera(next);
    await recognizerRef.current?.source.useCamera(next ? "environment" : "user");
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

  async function onSave() {
    if (!text || saving || !transcript) return;
    setSaving(true);
    try {
      const cardIds = transcript.entries.flatMap((e) => {
        if (e.source === "alphabet") return [`letter:${e.text.toUpperCase()}`];
        const id = curriculumIdFor(e.text, knownIds);
        return id ? [`sign:${id}`] : [];
      });
      const first = transcript.entries[0];
      await saveTranslation({
        text,
        cardIds,
        startedAt: first ? Date.now() - (performance.now() - first.atMs) : Date.now(),
        endedAt: Date.now(),
      });
      setHistory(await listTranslations(10));
      setNotice("Guardado en tu historial");
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  const running = status === "running";

  return (
    <main className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Práctica libre</p>
        <h1 className="text-2xl font-bold">Traductor de LSE</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Signa con naturalidad, sin pararte entre signos: el texto se escribe cuando cada signo
          termina. Reconoce el alfabeto dactilológico completo y {vocabulary.length || 286} signos
          del ámbito sanitario (lista abajo).
        </p>
      </header>

      <div
        role="note"
        className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
      >
        Útil, no infalible. Escribe una secuencia de signos, no una traducción gramatical
        («yo cabeza dolor», no «me duele la cabeza»). Aciertos medidos: ~70 % de los signos a la
        primera y ~90 % de las letras que escribe.
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="space-y-4">
          <div className="relative overflow-hidden rounded-2xl bg-slate-900">
            <video
              ref={videoRef}
              playsInline
              muted
              className={`block h-auto w-full ${rearCamera ? "" : "-scale-x-100"} ${running ? "" : "hidden"}`}
              aria-label="Vista previa de la cámara"
            />
            <canvas
              ref={canvasRef}
              className={`pointer-events-none absolute inset-0 h-full w-full ${rearCamera ? "" : "-scale-x-100"}`}
            />
            {!running && (
              <div className="flex aspect-video flex-col items-center justify-center gap-3 p-6 text-center text-sm text-slate-200">
                {status === "loading" ? (
                  <p>Descargando modelos (unos 20 MB la primera vez)…</p>
                ) : (
                  <>
                    <p>La imagen no sale de tu dispositivo: todo se procesa en el navegador.</p>
                    <button
                      type="button"
                      onClick={start}
                      className="rounded-full bg-brand-600 px-5 py-2 font-semibold text-white hover:bg-brand-700"
                    >
                      Empezar cámara
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

          <div className="flex flex-wrap items-center gap-2 text-sm">
            {running && (
              <button type="button" onClick={stop} className="text-slate-500 hover:underline">
                Detener cámara
              </button>
            )}
            <button type="button" onClick={switchCamera} className="text-slate-500 hover:underline">
              {rearCamera ? "Usar cámara frontal" : "Usar cámara trasera (leer a otra persona)"}
            </button>
          </div>

          <section
            aria-live="polite"
            className="min-h-[6rem] space-y-3 rounded-2xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
          >
            <p className="text-xs uppercase tracking-wider text-slate-500">Transcripción</p>
            <p className="text-lg font-medium">{text || "…"}</p>
            {running && (
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                <span>Viendo:</span>
                {candidates.length === 0 && <span>—</span>}
                {candidates.map((c) => (
                  <span
                    key={c.gloss.id}
                    className="rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  >
                    {c.gloss.text} · {SOURCE_LABEL[c.source]} · {Math.round(c.confidence * 100)} %
                  </span>
                ))}
              </div>
            )}
          </section>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => recognizerRef.current?.recognize.undo()}
              disabled={!text}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Deshacer último
            </button>
            <button
              type="button"
              onClick={() => {
                recognizerRef.current?.recognize.clear();
                setNotice(null);
              }}
              disabled={!text}
              className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
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
              onClick={onSave}
              disabled={!text || saving}
              className="rounded-full bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              {saving ? "Guardando…" : "Guardar"}
            </button>
          </div>
          {notice && <p className="text-sm text-slate-600">{notice}</p>}

          <details className="rounded-xl border border-slate-200 p-3 text-sm dark:border-slate-800">
            <summary className="cursor-pointer font-semibold">
              Signos que reconoce ({vocabulary.length} + alfabeto)
            </summary>
            <p className="mt-2 leading-relaxed text-slate-600 dark:text-slate-300">
              {vocabulary.join(" · ")}
            </p>
          </details>
        </div>

        <aside className="space-y-4">
          {lastWordId && clipsMap[lastWordId] && (
            <div className="space-y-1">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Así se signa «{lastWord?.text}»
              </h2>
              <div className="overflow-hidden rounded-xl border border-brand-200 dark:border-brand-800">
                <AvatarPlayer clip={clipsMap[lastWordId]!} size={260} />
              </div>
            </div>
          )}
          <div className="space-y-2">
            <h2 className="text-sm font-semibold">Historial</h2>
            <HistoryPanel entries={history} />
            {demo && (
              <p className="text-xs text-slate-500">(Modo demo · las traducciones viven en este navegador.)</p>
            )}
          </div>
          <p className="text-xs text-slate-500">
            Motor de reconocimiento de{" "}
            <a href="https://github.com/Endika/esku" className="underline" target="_blank" rel="noreferrer">
              Esku
            </a>
            , entrenado con SWL-LSE, LSE-Health-UVigo y LSE-FS-UVigo (Universidade de Vigo).
          </p>
        </aside>
      </div>
    </main>
  );
}

function drawFrame(
  canvas: HTMLCanvasElement | null,
  video: HTMLVideoElement | null,
  frame: LandmarkFrame | null,
) {
  if (!canvas || !video) return;
  if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
  if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!frame) return;
  const { width: w, height: h } = canvas;
  // MediaPipe rellena `visibility` a 0 en las manos: solo la pose la mide de verdad.
  const line = (
    pts: readonly Landmark[],
    pairs: readonly (readonly [number, number])[],
    checkVisibility: boolean,
  ) => {
    ctx.beginPath();
    for (const [a, b] of pairs) {
      const A = pts[a];
      const B = pts[b];
      if (!A || !B || (checkVisibility && (!isVisible(A) || !isVisible(B)))) continue;
      ctx.moveTo(A.x * w, A.y * h);
      ctx.lineTo(B.x * w, B.y * h);
    }
    ctx.stroke();
  };
  ctx.lineWidth = Math.max(2, w / 300);
  if (frame.pose) {
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    line(frame.pose.points, [...TORSO_CONNECTIONS, ...ARM_CONNECTIONS], true);
  }
  ctx.strokeStyle = "#f97316";
  for (const hand of frame.hands) line(hand.points, HAND_CONNECTIONS, false);
}
