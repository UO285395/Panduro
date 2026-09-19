import type { NormalizedLandmark } from "@/lib/mediapipe/types";
import type { Prediction } from "./knn";

/**
 * Reglas geométricas para desambiguar signos donde k-NN se equivoca de forma
 * sistemática. Se aplican DESPUÉS del clasificador con `refineWithRules`:
 *
 *   const raw = classifier.predict(features);
 *   const finalPrediction = refineWithRules(raw, landmarks);
 *
 * Cada regla:
 * - Devuelve la etiqueta corregida si dispara, o `null` si no aplica.
 * - Se ejecuta sobre los 21 landmarks NORMALIZADOS (wrist=origen, |wrist→mcp|=1).
 *
 * En el MVP cubrimos tres pares problemáticos:
 *   1) BIEN vs MAL → mirar el eje Y del pulgar.
 *   2) Y vs I → distinguir "meñique + pulgar" de "solo meñique".
 *   3) B vs 4 (LSE los distingue por pulgar plegado/extendido).
 */

// Índices notables (los mismos que usa lib/mediapipe/constants).
const THUMB_TIP = 4;
const THUMB_IP = 3;
const INDEX_MCP = 5;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const MIDDLE_TIP = 12;
const RING_TIP = 16;
const PINKY_TIP = 20;
const PINKY_MCP = 17;

type Rule = (lm: NormalizedLandmark[]) => string | null;

function isFingerExtended(
  lm: NormalizedLandmark[],
  tipIdx: number,
  mcpIdx: number,
): boolean {
  // "Extendido" = la yema está más lejos de la muñeca que el MCP correspondiente.
  const wrist = lm[0]!;
  const tip = lm[tipIdx]!;
  const mcp = lm[mcpIdx]!;
  const dTip = Math.hypot(tip.x - wrist.x, tip.y - wrist.y);
  const dMcp = Math.hypot(mcp.x - wrist.x, mcp.y - wrist.y);
  return dTip > dMcp * 1.4;
}

function isThumbUp(lm: NormalizedLandmark[]): boolean {
  const tip = lm[THUMB_TIP]!;
  const ip = lm[THUMB_IP]!;
  // Y crece hacia abajo en coordenadas de imagen; "arriba" = tip.y < ip.y.
  return tip.y < ip.y - 0.15;
}

function isThumbDown(lm: NormalizedLandmark[]): boolean {
  const tip = lm[THUMB_TIP]!;
  const ip = lm[THUMB_IP]!;
  return tip.y > ip.y + 0.15;
}

/** Regla BIEN/MAL: la orientación del pulgar decide, con el resto de dedos cerrados. */
const thumbOrientationRule: Rule = (lm) => {
  const indexExt = isFingerExtended(lm, INDEX_TIP, INDEX_MCP);
  const middleExt = isFingerExtended(lm, MIDDLE_TIP, MIDDLE_MCP);
  const ringExt = isFingerExtended(lm, RING_TIP, MIDDLE_MCP);
  const pinkyExt = isFingerExtended(lm, PINKY_TIP, PINKY_MCP);
  if (indexExt || middleExt || ringExt || pinkyExt) return null; // no hay puño cerrado
  if (isThumbUp(lm)) return "BIEN";
  if (isThumbDown(lm)) return "MAL";
  return null;
};

/** Regla Y: solo pulgar + meñique extendidos, resto cerrados. */
const yRule: Rule = (lm) => {
  const thumbExt = Math.abs(lm[THUMB_TIP]!.y - lm[0]!.y) > 0.4;
  const indexExt = isFingerExtended(lm, INDEX_TIP, INDEX_MCP);
  const middleExt = isFingerExtended(lm, MIDDLE_TIP, MIDDLE_MCP);
  const ringExt = isFingerExtended(lm, RING_TIP, MIDDLE_MCP);
  const pinkyExt = isFingerExtended(lm, PINKY_TIP, PINKY_MCP);
  if (thumbExt && pinkyExt && !indexExt && !middleExt && !ringExt) return "Y";
  return null;
};

/** Regla I: solo meñique extendido, incluido el pulgar cerrado. */
const iRule: Rule = (lm) => {
  const thumbExt = Math.abs(lm[THUMB_TIP]!.y - lm[0]!.y) > 0.4;
  const indexExt = isFingerExtended(lm, INDEX_TIP, INDEX_MCP);
  const middleExt = isFingerExtended(lm, MIDDLE_TIP, MIDDLE_MCP);
  const pinkyExt = isFingerExtended(lm, PINKY_TIP, PINKY_MCP);
  if (pinkyExt && !thumbExt && !indexExt && !middleExt) return "I";
  return null;
};

// ---------------------------------------------------------------------------
// Nuevas reglas para pares ambiguos del abecedario LSE
// ---------------------------------------------------------------------------

const INDEX_PIP = 6;
const MIDDLE_PIP = 10;
const RING_MCP = 13;
const RING_PIP = 14;
const PINKY_PIP = 18;

function fingerCurlY(lm: NormalizedLandmark[], tipIdx: number, pipIdx: number): number {
  // Curl estimado: distancia vertical tip–pip (positivo = más flexionado)
  return lm[pipIdx]!.y - lm[tipIdx]!.y;
}

function thumbIndexDistance(lm: NormalizedLandmark[]): number {
  const tip = lm[THUMB_TIP]!;
  const idx = lm[INDEX_TIP]!;
  return Math.hypot(tip.x - idx.x, tip.y - idx.y);
}

/** Regla C vs O: C tiene espacio entre pulgar e índice; O los une. */
const cRule: Rule = (lm) => {
  const allFingersPartlyBent =
    !isFingerExtended(lm, INDEX_TIP, INDEX_MCP) &&
    !isFingerExtended(lm, MIDDLE_TIP, MIDDLE_MCP) &&
    !isFingerExtended(lm, RING_TIP, RING_MCP) &&
    !isFingerExtended(lm, PINKY_TIP, PINKY_MCP);
  if (!allFingersPartlyBent) return null;
  const gap = thumbIndexDistance(lm);
  if (gap > 0.14) return "C";
  if (gap < 0.06) return "O";
  return null;
};

/** Regla D: índice extendido, otros cerrados, pulgar toca el lado del índice. */
const dRule: Rule = (lm) => {
  const indexExt = isFingerExtended(lm, INDEX_TIP, INDEX_MCP);
  const middleExt = isFingerExtended(lm, MIDDLE_TIP, MIDDLE_MCP);
  const ringExt = isFingerExtended(lm, RING_TIP, RING_MCP);
  const pinkyExt = isFingerExtended(lm, PINKY_TIP, PINKY_MCP);
  if (!indexExt || middleExt || ringExt || pinkyExt) return null;
  const thumbX = lm[THUMB_TIP]!.x;
  const indexX = lm[INDEX_MCP]!.x;
  // Pulgar cerca del lateral del índice (en X)
  if (Math.abs(thumbX - indexX) < 0.08) return "D";
  return null;
};

/** Regla E: todos los dedos curvados juntos hacia la palma. */
const eRule: Rule = (lm) => {
  const iBent = fingerCurlY(lm, INDEX_TIP, INDEX_PIP) < -0.05;
  const mBent = fingerCurlY(lm, MIDDLE_TIP, MIDDLE_PIP) < -0.05;
  const rBent = fingerCurlY(lm, RING_TIP, RING_PIP) < -0.05;
  const pBent = fingerCurlY(lm, PINKY_TIP, PINKY_PIP) < -0.05;
  const thumbLow = lm[THUMB_TIP]!.y > lm[INDEX_MCP]!.y;
  if (iBent && mBent && rBent && pBent && thumbLow) return "E";
  return null;
};

/** Regla F: pulgar toca el índice formando una O pequeña, otros 3 extendidos. */
const fRule: Rule = (lm) => {
  const middleExt = isFingerExtended(lm, MIDDLE_TIP, MIDDLE_MCP);
  const ringExt = isFingerExtended(lm, RING_TIP, RING_MCP);
  const pinkyExt = isFingerExtended(lm, PINKY_TIP, PINKY_MCP);
  if (!middleExt || !ringExt || !pinkyExt) return null;
  if (thumbIndexDistance(lm) < 0.07) return "F";
  return null;
};

/** Regla W: índice+medio+anular extendidos, meñique y pulgar cerrados. */
const wRule: Rule = (lm) => {
  const indexExt = isFingerExtended(lm, INDEX_TIP, INDEX_MCP);
  const middleExt = isFingerExtended(lm, MIDDLE_TIP, MIDDLE_MCP);
  const ringExt = isFingerExtended(lm, RING_TIP, RING_MCP);
  const pinkyExt = isFingerExtended(lm, PINKY_TIP, PINKY_MCP);
  const thumbExt = Math.abs(lm[THUMB_TIP]!.y - lm[0]!.y) > 0.3;
  if (indexExt && middleExt && ringExt && !pinkyExt && !thumbExt) return "W";
  return null;
};

/** Regla X: índice en gancho (curvado pero no extendido), resto cerrados. */
const xRule: Rule = (lm) => {
  const indexExt = isFingerExtended(lm, INDEX_TIP, INDEX_MCP);
  const middleExt = isFingerExtended(lm, MIDDLE_TIP, MIDDLE_MCP);
  const ringExt = isFingerExtended(lm, RING_TIP, RING_MCP);
  const pinkyExt = isFingerExtended(lm, PINKY_TIP, PINKY_MCP);
  if (middleExt || ringExt || pinkyExt) return null;
  // Índice curvado: pip más alto que tip (en imagen Y crece abajo)
  const indexHook = !indexExt && lm[INDEX_TIP]!.y > lm[INDEX_PIP]!.y - 0.02;
  if (indexHook) return "X";
  return null;
};

/** Regla N: índice+medio cerrados sobre el pulgar, resto extendidos. */
const nRule: Rule = (lm) => {
  const indexExt = isFingerExtended(lm, INDEX_TIP, INDEX_MCP);
  const middleExt = isFingerExtended(lm, MIDDLE_TIP, MIDDLE_MCP);
  const ringExt = isFingerExtended(lm, RING_TIP, RING_MCP);
  const pinkyExt = isFingerExtended(lm, PINKY_TIP, PINKY_MCP);
  if (indexExt || middleExt || !ringExt || !pinkyExt) return null;
  // Pulgar entre índice y medio (por encima de ellos)
  const thumbY = lm[THUMB_TIP]!.y;
  const indexPipY = lm[INDEX_PIP]!.y;
  if (thumbY > indexPipY) return "N";
  return null;
};

/** Regla M: índice+medio+anular cerrados sobre el pulgar. */
const mRule: Rule = (lm) => {
  const indexExt = isFingerExtended(lm, INDEX_TIP, INDEX_MCP);
  const middleExt = isFingerExtended(lm, MIDDLE_TIP, MIDDLE_MCP);
  const ringExt = isFingerExtended(lm, RING_TIP, RING_MCP);
  const pinkyExt = isFingerExtended(lm, PINKY_TIP, PINKY_MCP);
  if (indexExt || middleExt || ringExt || !pinkyExt) return null;
  const thumbY = lm[THUMB_TIP]!.y;
  const middlePipY = lm[MIDDLE_PIP]!.y;
  if (thumbY > middlePipY) return "M";
  return null;
};

const RULES: Rule[] = [thumbOrientationRule, yRule, iRule, cRule, dRule, eRule, fRule, wRule, xRule, nRule, mRule];

export function pureRule(lm: NormalizedLandmark[]): string | null {
  for (const r of RULES) {
    const hit = r(lm);
    if (hit) return hit;
  }
  return null;
}

/**
 * Si una regla dispara y la predicción k-NN choca con ella, la regla gana.
 * Si no hay regla activa, mantenemos la predicción original.
 */
export function refineWithRules(
  pred: Prediction | null,
  lm: NormalizedLandmark[],
): Prediction | null {
  const forced = pureRule(lm);
  if (!forced) return pred;
  if (!pred || pred.label !== forced) {
    return { label: forced, confidence: 0.95, distance: 0 };
  }
  // La regla confirma la predicción — subimos la confianza.
  return { ...pred, confidence: Math.max(pred.confidence, 0.9) };
}
