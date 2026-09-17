import { describe, expect, it } from "vitest";
import { pureRule, refineWithRules } from "@/lib/recognition/rules";
import type { NormalizedLandmark } from "@/lib/mediapipe/types";

function hand(overrides: Partial<Record<number, NormalizedLandmark>>): NormalizedLandmark[] {
  // Base: puño cerrado con wrist=0 y middle_mcp=(0,-1) (norm |wrist->mcp|=1).
  const base: NormalizedLandmark[] = Array.from({ length: 21 }, () => ({ x: 0, y: 0, z: 0 }));
  base[9] = { x: 0, y: -1, z: 0 }; // middle_mcp
  base[3] = { x: 0.1, y: 0.1, z: 0 }; // thumb_ip
  base[4] = { x: 0.1, y: 0.1, z: 0 }; // thumb_tip (por defecto no está ni arriba ni abajo)
  base[5] = { x: 0.4, y: -0.1, z: 0 }; // index_mcp
  base[8] = { x: 0.4, y: -0.1, z: 0 }; // index_tip (cerrado)
  base[12] = { x: 0, y: -0.5, z: 0 }; // middle_tip (cerrado)
  base[16] = { x: -0.3, y: -0.5, z: 0 }; // ring_tip
  base[17] = { x: -0.4, y: -0.1, z: 0 }; // pinky_mcp
  base[20] = { x: -0.4, y: -0.1, z: 0 }; // pinky_tip (cerrado)
  for (const [k, v] of Object.entries(overrides)) base[Number(k)] = v!;
  return base;
}

describe("thumbOrientationRule (BIEN / MAL)", () => {
  it("puño con pulgar arriba → BIEN", () => {
    const lm = hand({
      3: { x: 0.1, y: 0.1, z: 0 },
      4: { x: 0.1, y: -0.4, z: 0 }, // tip claramente por encima del ip
    });
    expect(pureRule(lm)).toBe("BIEN");
  });

  it("puño con pulgar abajo → MAL", () => {
    const lm = hand({
      3: { x: 0.1, y: 0.1, z: 0 },
      4: { x: 0.1, y: 0.6, z: 0 },
    });
    expect(pureRule(lm)).toBe("MAL");
  });

  it("mano abierta (índice extendido) → no dispara", () => {
    const lm = hand({
      3: { x: 0.1, y: 0.1, z: 0 },
      4: { x: 0.1, y: -0.4, z: 0 },
      8: { x: 0.4, y: -1.3, z: 0 }, // índice fuera del MCP → mano no cerrada
    });
    expect(pureRule(lm)).not.toBe("BIEN");
  });
});

describe("yRule (Y)", () => {
  it("pulgar + meñique extendidos → Y", () => {
    const lm = hand({
      4: { x: 0.5, y: 0.7, z: 0 }, // pulgar extendido lejos
      20: { x: -0.8, y: -0.9, z: 0 }, // meñique extendido
    });
    expect(pureRule(lm)).toBe("Y");
  });
});

describe("iRule (I)", () => {
  it("solo meñique extendido → I", () => {
    const lm = hand({
      20: { x: -0.8, y: -0.9, z: 0 }, // meñique extendido; pulgar cerrado (base)
    });
    expect(pureRule(lm)).toBe("I");
  });
});

describe("refineWithRules", () => {
  it("corrige la predicción cuando la regla dice otra cosa", () => {
    const lm = hand({
      3: { x: 0.1, y: 0.1, z: 0 },
      4: { x: 0.1, y: -0.4, z: 0 },
    });
    const refined = refineWithRules(
      { label: "MAL", confidence: 0.6, distance: 0.1 },
      lm,
    );
    expect(refined?.label).toBe("BIEN");
    expect(refined?.confidence).toBeGreaterThan(0.5);
  });

  it("sube la confianza cuando la regla confirma la predicción", () => {
    const lm = hand({
      3: { x: 0.1, y: 0.1, z: 0 },
      4: { x: 0.1, y: -0.4, z: 0 },
    });
    const refined = refineWithRules(
      { label: "BIEN", confidence: 0.5, distance: 0.1 },
      lm,
    );
    expect(refined?.label).toBe("BIEN");
    expect(refined?.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("deja pasar la predicción si ninguna regla dispara", () => {
    // Mano genérica con dedos cerrados y pulgar neutro: ninguna regla activa.
    const lm = hand({});
    const refined = refineWithRules(
      { label: "HOLA", confidence: 0.4, distance: 0.2 },
      lm,
    );
    expect(refined?.label).toBe("HOLA");
    expect(refined?.confidence).toBe(0.4);
  });
});
