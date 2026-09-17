"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type PermissionState = "idle" | "requesting" | "granted" | "denied" | "unsupported" | "error";

type Props = {
  /** Se llama cuando el <video> está reproduciendo y listo para inferencia. */
  onReady?: (video: HTMLVideoElement) => void;
  /** Se llama al detener el stream. */
  onStop?: () => void;
  /** Contenido superpuesto al vídeo (overlays de landmarks, guías, etc.). */
  overlay?: React.ReactNode;
  className?: string;
};

/**
 * Feed de cámara con permisos gestionados y fallback accesible.
 * El frame nunca sale del dispositivo — se procesa localmente con WebAssembly.
 */
export function CameraFeed({ onReady, onStop, overlay, className }: Props) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<PermissionState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const start = useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setState("unsupported");
      return;
    }
    setState("requesting");
    setErrorMessage(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) return;
      video.srcObject = stream;
      video.playsInline = true;
      video.muted = true;
      await video.play();
      setState("granted");
      onReady?.(video);
    } catch (err) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setState("denied");
      } else {
        setState("error");
        setErrorMessage(err instanceof Error ? err.message : "Error desconocido");
      }
    }
  }, [onReady]);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState("idle");
    onStop?.();
  }, [onStop]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  return (
    <div className={className}>
      <div className="relative overflow-hidden rounded-2xl bg-slate-900 aspect-video">
        <video
          ref={videoRef}
          className={`h-full w-full -scale-x-100 object-cover ${state === "granted" ? "" : "hidden"}`}
          aria-label="Vista previa de tu cámara"
        />
        {state === "granted" && overlay}
        {state !== "granted" && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-slate-100">
            <PermissionMessage state={state} error={errorMessage} />
            {(state === "idle" || state === "denied" || state === "error") && (
              <button
                type="button"
                onClick={start}
                className="rounded-full bg-brand-600 px-5 py-2 font-semibold text-white hover:bg-brand-700"
              >
                {state === "idle" ? "Empezar cámara" : "Reintentar"}
              </button>
            )}
          </div>
        )}
      </div>
      {state === "granted" && (
        <button
          type="button"
          onClick={stop}
          className="mt-3 text-sm text-slate-500 hover:underline"
        >
          Detener cámara
        </button>
      )}
      <p className="mt-2 text-xs text-slate-500">
        La imagen no sale de tu dispositivo. El reconocimiento se ejecuta
        localmente en el navegador.
      </p>
    </div>
  );
}

function PermissionMessage({
  state,
  error,
}: {
  state: PermissionState;
  error: string | null;
}) {
  if (state === "requesting") return <p>Pidiendo permiso…</p>;
  if (state === "denied")
    return (
      <p>
        Denegaste el acceso a la cámara. Cambia el permiso en tu navegador y
        vuelve a intentarlo.
      </p>
    );
  if (state === "unsupported")
    return (
      <p>
        Tu navegador no soporta acceso a la cámara. Prueba en Chrome o Safari
        actualizado.
      </p>
    );
  if (state === "error") return <p>Se produjo un error: {error ?? "desconocido"}.</p>;
  return (
    <p>
      Panduro necesita acceso a tu cámara para dar feedback de tus signos. No se
      almacena vídeo.
    </p>
  );
}
