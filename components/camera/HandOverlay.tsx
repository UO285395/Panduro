"use client";

import { useEffect, useRef } from "react";
import { HAND_CONNECTIONS } from "@/lib/mediapipe/constants";
import type { HandFrame } from "@/lib/mediapipe/types";

type Props = {
  /** Ref al <video> subyacente para dimensionar el canvas. */
  videoRef: React.RefObject<HTMLVideoElement | null>;
  /** Frame actual (o null si no hay detección). */
  frame: HandFrame | null;
  className?: string;
};

/**
 * Canvas absoluto que se dibuja sobre el vídeo con los 21 landmarks y sus
 * conexiones. El vídeo va espejado (`-scale-x-100`), así que también lo
 * espejamos aquí para que las coordenadas coincidan.
 */
export function HandOverlay({ videoRef, frame, className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // Redimensiona el canvas cuando el vídeo cambia de tamaño.
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;

    const resize = () => {
      canvas.width = video.clientWidth;
      canvas.height = video.clientHeight;
    };
    const ro = new ResizeObserver(resize);
    ro.observe(video);
    resize();
    return () => ro.disconnect();
  }, [videoRef]);

  // Pinta el frame actual.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (!frame) return;

    const w = canvas.width;
    const h = canvas.height;
    const toXY = (i: number) => {
      const p = frame.imageLandmarks[i]!;
      return { x: p.x * w, y: p.y * h };
    };

    // conexiones
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#1a72f2";
    ctx.beginPath();
    for (const [a, b] of HAND_CONNECTIONS) {
      const A = toXY(a);
      const B = toXY(b);
      ctx.moveTo(A.x, A.y);
      ctx.lineTo(B.x, B.y);
    }
    ctx.stroke();

    // landmarks
    ctx.fillStyle = "#ffb020";
    for (let i = 0; i < frame.imageLandmarks.length; i++) {
      const { x, y } = toXY(i);
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }, [frame]);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none absolute inset-0 -scale-x-100 ${className ?? ""}`}
      aria-hidden
    />
  );
}
