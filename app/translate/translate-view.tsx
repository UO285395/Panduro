"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { RecognitionUpdate } from "@/lib/esku/application/use-cases/RecognizeSignsUseCase";
import { createGloss, type SignCandidate } from "@/lib/esku/domain/recognition/value-objects/Gloss";
import type { Transcript } from "@/lib/esku/domain/transcript/entities/Transcript";
import type { AvatarClip } from "@/lib/curriculum/schema";
import { drawFrame } from "@/lib/recognition/drawFrame";
import { createRecognizer, VOCABULARY_MANIFEST_URL, type Recognizer } from "@/lib/recognition/engine";
import {
  entryKey,
  FpsMeter,
  renderTokens,
  tokenize,
  type Token,
  type TranslateMode,
} from "@/lib/recognition/session";
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

const MODES: { id: TranslateMode; label: string; hint: string }[] = [
  { id: "signs", label: "Signos", hint: "Solo signos completos: no escribe letras sueltas." },
  { id: "letters", label: "Deletreo", hint: "Solo el alfabeto: para nombres y palabras que no tienen signo." },
  { id: "both", label: "Mixto", hint: "Los dos a la vez. Más flexible, pero se confunde más." },
];

const MODE_KEY = "panduro.translate.mode";
/** Por debajo de esto el segmentador apenas puede cerrar signos (ver SignSegmenter). */
const LOW_FPS = 12;

type Feedback = { tone: "info" | "warn"; text: string } | null;

function readMode(): TranslateMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    return v === "letters" || v === "both" ? v : "signs";
  } catch {
    return "signs";
  }
}

export function TranslateView({ initialHistory, demo, clipsMap = {} }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recognizerRef = useRef<Recognizer | null>(null);
  const lastTextRef = useRef("");
  const lastCandidatesRef = useRef("");
  const seenEntriesRef = useRef(new Set<string>());
  const windowsRef = useRef(0);
  const fpsRef = useRef(new FpsMeter());
  const modeRef = useRef<TranslateMode>("signs");

  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [rearCamera, setRearCamera] = useState(false);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [candidates, setCandidates] = useState<readonly SignCandidate[]>([]);
  const [vocabulary, setVocabulary] = useState<string[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<TranslationRow[]>(initialHistory);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<TranslateMode>("signs");
  const [signing, setSigning] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const [fps, setFps] = useState<number | null>(null);
  /** Correcciones del usuario por entrada ("" = borrada). */
  const [edits, setEdits] = useState<Map<string, string>>(new Map());
  /** Otras opciones del modelo para cada signo escrito. */
  const [alternatives, setAlternatives] = useState<Map<string, string[]>>(new Map());
  const [openToken, setOpenToken] = useState<string | null>(null);

  const knownIds = useMemo(() => new Set(Object.keys(clipsMap)), [clipsMap]);
  const tokens = useMemo(() => tokenize(transcript?.entries ?? [], edits), [transcript, edits]);
  const text = renderTokens(tokens);
  const lastWord = [...tokens].reverse().find((t) => t.kind === "word");
  const lastWordId = lastWord ? curriculumIdFor(lastWord.text, knownIds) : null;

  useEffect(() => {
    const saved = readMode();
    modeRef.current = saved;
    setMode(saved);
  }, []);

  function changeMode(next: TranslateMode) {
    modeRef.current = next;
    setMode(next);
    setCandidates([]);
    setFeedback(null);
    recognizerRef.current?.setMode(next);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* preferencia opcional */
    }
  }

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
    const rec = recognizerRef.current;

    // Cada signo nuevo guarda las otras opciones que barajó el modelo, para corregir con un toque.
    const fresh = update.transcript.entries.filter((e) => !seenEntriesRef.current.has(entryKey(e)));
    if (fresh.length) {
      const others = (rec?.vocabulary.lastScores ?? [])
        .map((r) => r.text)
        .filter((t) => t !== "sin signo");
      setAlternatives((prev) => {
        const next = new Map(prev);
        for (const e of fresh) {
          if (e.source === "vocabulary") next.set(entryKey(e), others.filter((t) => t !== e.text));
        }
        return next;
      });
      for (const e of fresh) seenEntriesRef.current.add(entryKey(e));
    }

    const nextText = update.transcript.entries.map(entryKey).join(",");
    if (nextText !== lastTextRef.current || update.transcript.isEmpty) {
      lastTextRef.current = nextText;
      setTranscript(update.transcript);
    }

    const top = modeRef.current === "signs" ? [] : update.candidates.slice(0, 3);
    const key = top.map((c) => `${c.gloss.id}:${c.confidence.toFixed(2)}`).join("|");
    if (key !== lastCandidatesRef.current) {
      lastCandidatesRef.current = key;
      setCandidates(top);
    }

    const d = update.diagnostics;
    setSigning(d.segmenterActive);
    if (d.windowsClosed !== windowsRef.current) {
      windowsRef.current = d.windowsClosed;
      const best = d.lastRawTop[0];
      if (modeRef.current === "letters") setFeedback(null);
      else if (!d.lastVeto) setFeedback(null);
      else if (d.lastVeto === "abstention") setFeedback({ tone: "info", text: "Movimiento sin signo: no he escrito nada." });
      else if (best && d.lastVeto !== "duplicate")
        setFeedback({
          tone: "warn",
          text: `No estoy seguro (¿«${best.text}», ${Math.round(best.confidence * 100)} %?). Repítelo algo más marcado.`,
        });
    }

    if (update.frame.timestampMs > 0) {
      fpsRef.current.push(update.frame.timestampMs);
      const f = fpsRef.current.fps;
      if (f !== null) {
        const shown = f < 10 ? Math.round(f * 10) / 10 : Math.round(f);
        setFps((prev) => (prev !== null && Math.abs(prev - shown) < 1 && f >= 10 ? prev : shown));
      }
    }
  }

  async function start() {
    const video = videoRef.current;
    if (!video) return;
    setError(null);
    setStatus("loading");
    try {
      const rec = (recognizerRef.current ??= createRecognizer(video, modeRef.current));
      rec.setMode(modeRef.current);
      fpsRef.current.reset();
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
    setSigning(false);
    setFeedback(null);
    setFps(null);
    setStatus("idle");
  }

  function clearAll() {
    recognizerRef.current?.recognize.clear();
    setEdits(new Map());
    setOpenToken(null);
    setNotice(null);
  }

  function edit(token: Token, value: string) {
    setEdits((prev) => {
      const next = new Map(prev);
      for (const k of token.keys) next.set(k, k === token.keys[0] ? value : "");
      return next;
    });
    setOpenToken(null);
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
      const cardIds = tokens.flatMap((t) => {
        if (t.kind === "spelled") return [...t.text.toUpperCase()].map((l) => `letter:${l}`);
        const id = curriculumIdFor(t.text, knownIds);
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
          El texto se escribe cuando cada signo termina. Reconoce el alfabeto dactilológico y{" "}
          {vocabulary.length || 286} signos del ámbito sanitario (lista abajo).
        </p>
      </header>

      <div
        role="note"
        className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
      >
        Útil, no infalible. Escribe una secuencia de signos, no una traducción gramatical
        («yo cabeza dolor», no «me duele la cabeza»). Aciertos medidos: ~70 % de los signos a la
        primera y ~86 % entre sus tres opciones (toca una palabra para corregirla), ~90 % de las letras.
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-wider text-slate-500">Qué vas a signar</legend>
        <div role="radiogroup" className="inline-flex rounded-full border border-slate-300 p-1 dark:border-slate-700">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={mode === m.id}
              onClick={() => changeMode(m.id)}
              className={`rounded-full px-4 py-1.5 text-sm font-semibold ${
                mode === m.id
                  ? "bg-brand-600 text-white"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-500">{MODES.find((m) => m.id === mode)?.hint}</p>
      </fieldset>

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
            {running && (
              <div className="pointer-events-none absolute left-3 top-3 flex gap-2 text-xs font-semibold">
                {mode !== "letters" && (
                  <span
                    className={`rounded-full px-2.5 py-1 ${signing ? "bg-brand-600 text-white" : "bg-black/50 text-white/80"}`}
                  >
                    {signing ? "● Signando…" : "Listo para el siguiente signo"}
                  </span>
                )}
                {fps !== null && (
                  <span className={`rounded-full px-2.5 py-1 ${fps < LOW_FPS ? "bg-amber-500 text-black" : "bg-black/50 text-white/80"}`}>
                    {fps} fps
                  </span>
                )}
              </div>
            )}
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
            {tokens.length === 0 ? (
              <p className="text-lg font-medium">…</p>
            ) : (
              <ul className="flex flex-wrap gap-2 text-lg font-medium">
                {tokens.map((t, i) => {
                  const options = t.kind === "word" ? (alternatives.get(t.key) ?? []) : [];
                  const open = openToken === t.key;
                  const label = i === 0 ? t.text.charAt(0).toUpperCase() + t.text.slice(1) : t.text;
                  return (
                    <li key={t.key} className="relative">
                      <button
                        type="button"
                        onClick={() => setOpenToken(open ? null : t.key)}
                        aria-expanded={open}
                        className={`rounded-lg px-2 py-0.5 hover:bg-slate-100 dark:hover:bg-slate-800 ${
                          t.kind === "spelled" ? "italic" : ""
                        } ${open ? "bg-slate-100 dark:bg-slate-800" : ""}`}
                      >
                        {label}
                      </button>
                      {open && (
                        <div className="absolute left-0 top-full z-10 mt-1 min-w-[10rem] space-y-1 rounded-xl border border-slate-200 bg-white p-2 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-900">
                          {options.length > 0 && (
                            <p className="px-1 text-xs text-slate-500">¿Querías decir…?</p>
                          )}
                          {options.map((o) => (
                            <button
                              key={o}
                              type="button"
                              onClick={() => edit(t, o)}
                              className="block w-full rounded-lg px-2 py-1 text-left hover:bg-brand-50 dark:hover:bg-brand-950/40"
                            >
                              {o}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => edit(t, "")}
                            className="block w-full rounded-lg px-2 py-1 text-left text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40"
                          >
                            Quitar
                          </button>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {feedback && (
              <p className={`text-sm ${feedback.tone === "warn" ? "text-amber-700 dark:text-amber-300" : "text-slate-500"}`}>
                {feedback.text}
              </p>
            )}
            {running && mode !== "signs" && (
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
            {running && fps !== null && fps < LOW_FPS && (
              <p className="text-xs text-amber-700 dark:text-amber-300">
                La cámara va a {fps} fps: con tan pocos fotogramas los signos se cortan mal. Cierra
                otras pestañas o aplicaciones, o usa un dispositivo más potente.
              </p>
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
              onClick={clearAll}
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
            <summary className="cursor-pointer font-semibold">Cómo encadenar varios signos o letras</summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-slate-600 dark:text-slate-300">
              <li>
                Elige el modo: <strong>Signos</strong> para frases, <strong>Deletreo</strong> para
                nombres. En Mixto las formas de mano de un signo pueden leerse como letras.
              </li>
              <li>
                Entre signo y signo, frena un instante: el corte se detecta cuando la mano
                desacelera. La etiqueta «Signando…» se apaga cuando ya lo ha cogido.
              </li>
              <li>
                Al deletrear, sostén cada letra un momento; para una letra doble (LL, RR) baja o
                relaja la mano entre las dos. Una pausa de más de un segundo y medio empieza otra palabra.
              </li>
              <li>Que se vean las dos manos, los hombros y la cara, con buena luz de frente.</li>
            </ul>
          </details>

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
