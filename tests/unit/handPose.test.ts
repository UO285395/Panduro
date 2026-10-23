import { describe, expect, it } from "vitest";
import { REACTION_MS, approach, handPose } from "@/lib/mascot/handPose";

describe("handPose", () => {
  it("en reposo saluda con la mano abierta y los dedos hacia arriba", () => {
    for (let t = 0; t < 6000; t += 300) {
      const p = handPose("idle", t, t);
      expect(p.tilt).toBeCloseTo(-Math.PI / 2);
      expect(p.curl).toBeLessThan(0.2);
      expect(p.thumb).toBe(0);
      expect(Math.abs(p.sway)).toBeLessThan(0.1);
    }
  });

  it("al acertar cierra el puño con el pulgar arriba", () => {
    const p = handPose("correct", REACTION_MS.correct + 100, 0);
    expect(p).toMatchObject({ tilt: 0, roll: 0, curl: 1, thumb: 1 });
  });

  it("al fallar gira el puño: pulgar abajo", () => {
    const p = handPose("incorrect", REACTION_MS.incorrect + 100, 0);
    expect(p).toMatchObject({ tilt: 0, curl: 1, thumb: 1 });
    expect(p.roll).toBeCloseTo(Math.PI);
  });

  it("el gesto se apaga y la pose se queda quieta", () => {
    for (const mood of ["correct", "incorrect", "celebrate"] as const) {
      const mid = handPose(mood, REACTION_MS[mood] * 0.3, 0);
      expect(Math.abs(mid.y) + Math.abs(mid.sway) + Math.abs(mid.spin)).toBeGreaterThan(0.01);
      const end = handPose(mood, REACTION_MS[mood] + 1, 0);
      expect(Math.abs(end.sway)).toBeLessThan(1e-9);
      expect(Math.abs(end.y)).toBeLessThan(0.06);
    }
    // La vuelta de la celebración termina de frente.
    expect(handPose("celebrate", REACTION_MS.celebrate + 1, 0).spin).toBeCloseTo(2 * Math.PI);
  });

  it("sin movimiento (movimiento reducido) no salta ni se sacude", () => {
    for (const mood of ["idle", "correct", "incorrect", "celebrate"] as const) {
      for (let t = 0; t < 2000; t += 100) {
        const p = handPose(mood, t, t, true);
        expect(Math.abs(p.y)).toBe(0);
        expect(Math.abs(p.sway)).toBe(0);
        expect(Math.abs(p.spin)).toBe(0);
      }
    }
  });
});

describe("approach", () => {
  it("se acerca al objetivo sin pasarse y no depende de los fps", () => {
    expect(approach(0, 1, 0, 90)).toBe(0);
    expect(approach(0, 1, 90, 90)).toBeCloseTo(1 - Math.exp(-1));
    let a = 0;
    for (let i = 0; i < 6; i++) a = approach(a, 1, 15, 90);
    expect(a).toBeCloseTo(approach(0, 1, 90, 90));
    expect(approach(0, 1, 10_000, 90)).toBeCloseTo(1);
  });
});
