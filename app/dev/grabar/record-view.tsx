"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AvatarPlayer } from "@/components/avatar/AvatarPlayer";
import { framesToClip, type CaptureFrame, type CaptureResult } from "@/lib/avatar/capture";
import { HAND_CONNECTIONS } from "@/lib/mediapipe/constants";
import { SignRecorder, type RecorderOutput } from "@/lib/mediapipe/signRecorder";

export type SignOption = {
  id: string;
  translation: string;
  description: string;
  level: string;
  recorded: boolean;
};

type Status = "idle" | "loading" | "live" | "countdown" | "recording" | "done";
type Source = "camera" | "video";

const POSE_LINKS: [number, number][] = [
  [11, 12], [11, 13], [13, 15], [12, 14], [14, 16], [11, 23], [12, 24], [9, 10],
];

export function RecordView({ signs, initialSign }: { signs: SignOption[]; initialSign?: string }) {
  const [query, setQuery] = useState("");
  const [signId, setSignId] = useState(
    signs.some((s) => s.id === initialSign) ? initialSign! : signs[0]?.id ?? "",
  );
  const [leftHanded, setLeftHanded] = useState(false);
  const [source, setSource] = useState<Source>("camera");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(0);
  const [result, setResult] = useState<CaptureResult | null>(null);
  const [videoName, setVideoName] = useState("");
  const [copied, setCopied] = useState(false);
  const [progress, setProgress] = useState(0);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const recorderRef = useRef<SignRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const framesRef = useRef<CaptureFrame[]>([]);
  const recordingRef = useRef(false);
  const processingRef = useRef(false);
  const rafRef = useRef(0);
  const lastVideoTimeRef = useRef(-1);

  const sign = signs.find((s) => s.id === signId);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return signs;
    return signs.filter((s) => s.id.toLowerCase().includes(q) || s.translation.toLowerCase().includes(q));
  }, [query, signs]);

  const draw = useCallback((out: RecorderOutput | null) => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    if (canvas.width !== video.videoWidth) canvas.width = video.videoWidth;
    if (canvas.height !== video.videoHeight) canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!out) return;
    const { width: w, height: h } = canvas;
    ctx.lineWidth = Math.max(2, w / 250);
    if (out.poseImage) {
      ctx.strokeStyle = "rgba(255,255,255,0.85)";
      ctx.beginPath();
      for (const [a, b] of POSE_LINKS) {
        const A = out.poseImage[a]!;
        const B = out.poseImage[b]!;
        ctx.moveTo(A.x * w, A.y * h);
        ctx.lineTo(B.x * w, B.y * h);
      }
      ctx.stroke();
    }
    ctx.strokeStyle = "#f97316";
    for (const hand of out.handsImage) {
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.moveTo(hand[a]!.x * w, hand[a]!.y * h);
        ctx.lineTo(hand[b]!.x * w, hand[b]!.y * h);
      }
      ctx.stroke();
    }
  }, []);

  const finish = useCallback(() => {
    recordingRef.current = false;
    setResult(framesToClip(framesRef.current, { leftHanded }));
    setStatus("done");
  }, [leftHanded]);

  const loop = useCallback(() => {
    const video = videoRef.current;
    const recorder = recorderRef.current;
    if (
      video && recorder && !processingRef.current &&
      video.readyState >= 2 && video.currentTime !== lastVideoTimeRef.current
    ) {
      lastVideoTimeRef.current = video.currentTime;
      const t = video.srcObject ? performance.now() : video.currentTime * 1000;
      const out = recorder.detect(video, t);
      draw(out);
      if (out && recordingRef.current) framesRef.current.push(out.frame);
    }
    rafRef.current = requestAnimationFrame(loop);
  }, [draw]);

  const ensureRecorder = useCallback(async () => {
    if (recorderRef.current) return;
    setStatus("loading");
    const rec = new SignRecorder();
    await rec.init();
    recorderRef.current = rec;
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(loop);
  }, [loop]);

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(
    () => () => {
      cancelAnimationFrame(rafRef.current);
      stopCamera();
      recorderRef.current?.close();
    },
    [],
  );

  async function startCamera() {
    setError(null);
    setResult(null);
    try {
      await ensureRecorder();
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      stopCamera();
      streamRef.current = stream;
      const video = videoRef.current!;
      video.removeAttribute("src");
      video.srcObject = stream;
      video.muted = true;
      await video.play();
      setSource("camera");
      setStatus("live");
    } catch (e) {
      setStatus("idle");
      setError(e instanceof Error ? e.message : "No se pudo abrir la cámara.");
    }
  }

  async function loadVideo(file: File) {
    setError(null);
    setResult(null);
    try {
      await ensureRecorder();
      stopCamera();
      const video = videoRef.current!;
      video.srcObject = null;
      video.src = URL.createObjectURL(file);
      video.muted = true;
      await new Promise((ok) => video.addEventListener("loadeddata", ok, { once: true }));
      setVideoName(file.name);
      setSource("video");
      setStatus("live");
    } catch (e) {
      setStatus("idle");
      setError(e instanceof Error ? e.message : "No se pudo abrir el vídeo.");
    }
  }

  // Los vídeos se procesan fotograma a fotograma (buscar → detectar → avanzar)
  // para no perder fotogramas cuando la inferencia es más lenta que el vídeo.
  async function processVideo() {
    const video = videoRef.current!;
    const recorder = recorderRef.current!;
    const seek = (t: number) =>
      new Promise<void>((done) => {
        video.addEventListener("seeked", () => done(), { once: true });
        video.currentTime = t;
      });
    processingRef.current = true;
    setStatus("recording");
    video.pause();
    let duration = video.duration;
    if (!Number.isFinite(duration)) {
      // Los webm de MediaRecorder no traen duración hasta buscar al final.
      await seek(1e7);
      duration = video.duration;
    }
    const step = 1 / 30;
    for (let t = 0; t <= duration; t += step) {
      await seek(t);
      const out = recorder.detect(video, t * 1000);
      draw(out);
      if (out) framesRef.current.push(out.frame);
      setProgress(t / duration);
    }
    processingRef.current = false;
    finish();
  }

  function record() {
    setResult(null);
    framesRef.current = [];
    if (source === "video") {
      void processVideo();
      return;
    }
    setStatus("countdown");
    let n = 3;
    setCountdown(n);
    const timer = setInterval(() => {
      n -= 1;
      setCountdown(n);
      if (n === 0) {
        clearInterval(timer);
        recordingRef.current = true;
        setStatus("recording");
      }
    }, 1000);
  }

  const exportData = () => {
    if (!result?.ok) return null;
    return JSON.stringify(
      {
        version: 1,
        signs: {
          [signId]: {
            avatarClip: result.clip,
            templates: result.templates,
            recordedAt: new Date().toISOString(),
            source: source === "camera" ? "webcam" : `video:${videoName}`,
          },
        },
      },
      null,
      2,
    );
  };

  function download() {
    const json = exportData();
    if (!json) return;
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${signId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    const json = exportData();
    if (!json) return;
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const busy = status === "loading" || status === "countdown" || status === "recording";

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
      <section className="space-y-4">
        <div className="space-y-2">
          <label className="block text-sm font-medium" htmlFor="sign-search">1. Signo</label>
          <input
            id="sign-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar (HOLA, gracias…)"
            className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <select
            size={8}
            value={signId}
            onChange={(e) => setSignId(e.target.value)}
            aria-label="Signo a grabar"
            className="w-full rounded-md border border-slate-300 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            {filtered.map((s) => (
              <option key={s.id} value={s.id}>
                {s.recorded ? "✓ " : ""}{s.id} — {s.translation} ({s.level})
              </option>
            ))}
          </select>
          {sign && (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              <span className="font-semibold">Definición actual:</span> {sign.description || "—"}{" "}
              <Link href={`/glossary/${sign.id}`} className="text-brand-600 hover:underline">Ver avatar actual</Link>
            </p>
          )}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">2. Fuente</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={startCamera}
              disabled={busy}
              className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              Usar cámara
            </button>
            <label className={`cursor-pointer rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold hover:border-brand-400 dark:border-slate-700 ${busy ? "pointer-events-none opacity-50" : ""}`}>
              Subir vídeo
              <input
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && loadVideo(e.target.files[0])}
              />
            </label>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={leftHanded} onChange={(e) => setLeftHanded(e.target.checked)} />
            La persona que signa es zurda
          </label>
        </div>

        <ul className="list-disc space-y-1 pl-5 text-xs text-slate-500">
          <li>De frente, de cintura para arriba, con buena luz y fondo liso.</li>
          <li>Empieza y termina con las manos bajadas: el reposo se recorta solo.</li>
          <li>Vídeos sin efecto espejo (la vista previa de la cámara sí se ve en espejo).</li>
          <li>Un signo por grabación, a velocidad normal.</li>
        </ul>
      </section>

      <section className="space-y-4">
        <div className="relative overflow-hidden rounded-2xl bg-slate-900">
          <video
            ref={videoRef}
            playsInline
            className={`block h-auto w-full ${source === "camera" ? "-scale-x-100" : ""} ${status === "idle" || status === "loading" ? "hidden" : ""}`}
          />
          <canvas
            ref={canvasRef}
            className={`pointer-events-none absolute inset-0 h-full w-full ${source === "camera" ? "-scale-x-100" : ""}`}
          />
          {(status === "idle" || status === "loading") && (
            <div className="flex aspect-video items-center justify-center p-6 text-center text-sm text-slate-200">
              {status === "loading" ? "Cargando modelos de MediaPipe…" : "Elige la cámara o sube un vídeo."}
            </div>
          )}
          {status === "countdown" && (
            <div className="absolute inset-0 flex items-center justify-center text-7xl font-bold text-white drop-shadow">
              {countdown}
            </div>
          )}
          {status === "recording" && (
            <div className="absolute left-3 top-3 rounded-full bg-red-600 px-3 py-1 text-xs font-semibold text-white">
              {source === "video" ? `Procesando ${Math.round(progress * 100)} %` : `● Grabando ${sign?.id}`}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {(status === "live" || status === "done") && (
            <button
              type="button"
              onClick={record}
              className="rounded-full bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-700"
            >
              {source === "camera" ? "● Grabar" : "▶ Procesar vídeo"}
            </button>
          )}
          {status === "recording" && source === "camera" && (
            <button
              type="button"
              onClick={finish}
              className="rounded-full bg-slate-800 px-5 py-2 text-sm font-semibold text-white"
            >
              ■ Parar
            </button>
          )}
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {result && !result.ok && (
          <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-100">
            {result.error}
          </p>
        )}

        {result?.ok && (
          <div className="space-y-3 rounded-2xl border border-slate-200 p-4 dark:border-slate-700">
            <div className="flex flex-wrap items-center gap-4">
              <div className="overflow-hidden rounded-xl bg-brand-100">
                <AvatarPlayer clip={result.clip} size={220} />
              </div>
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                <dt className="text-slate-500">Duración</dt>
                <dd>{(result.stats.durationMs / 1000).toFixed(1)} s</dd>
                <dt className="text-slate-500">Cuerpo detectado</dt>
                <dd>{Math.round(result.stats.poseRate * 100)} %</dd>
                <dt className="text-slate-500">Mano dominante</dt>
                <dd>{Math.round(result.stats.handRate * 100)} %</dd>
                <dt className="text-slate-500">Manos</dt>
                <dd>{result.stats.twoHands ? "dos" : "una"}</dd>
              </dl>
            </div>
            {result.stats.handRate < 0.6 && (
              <p className="text-sm text-amber-700">
                La mano se perdió en muchos fotogramas: repite con más luz o más cerca.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={download}
                className="rounded-full bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700"
              >
                Descargar {signId}.json
              </button>
              <button
                type="button"
                onClick={copy}
                className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold dark:border-slate-700"
              >
                {copied ? "Copiado" : "Copiar JSON"}
              </button>
            </div>
            <p className="text-xs text-slate-500">
              Para usarlo en la app: <code>node scripts/add-captured.mjs {signId}.json</code> desde la
              carpeta del proyecto (o envíame el archivo).
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
