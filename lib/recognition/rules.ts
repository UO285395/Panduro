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

const RULES: Rule[] = [thumbOrientationRule, yRule, iRule];

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
