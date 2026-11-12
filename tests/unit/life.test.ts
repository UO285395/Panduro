import { describe, expect, it } from "vitest";
import { GAZE_MAX, NO_LEAN, breathAt, easeLean, gazeFor, glanceAt, idleHeadAt, signLean, swayAt } from "@/lib/avatar/life";

const hand = (x: number, z = 0) => ({ x, y: 0.4, z, rot: [0, 0, 0] as [number, number, number] });

describe("vida del avatar", () => {
  it("respira entre −1 y 1, sin saltos, y coge aire más deprisa de lo que lo suelta", () => {
    let prev = breathAt(0);
    let rising = 0;
    for (let t = 10; t <= 3900; t += 10) {
      const b = breathAt(t);
      expect(Math.abs(b)).toBeLessThanOrEqual(1);
      expect(Math.abs(b - prev)).toBeLessThan(0.05);
      if (b > prev) rising++;
      prev = b;
    }
    expect(rising).toBeLessThan(195);
    expect(breathAt(3900)).toBeCloseTo(breathAt(0), 5);
  });

  it("el vaivén y la cabeza en reposo son pequeños", () => {
    for (let t = 0; t < 60000; t += 137) {
      const s = swayAt(t);
      expect(Math.max(Math.abs(s.yaw), Math.abs(s.pitch), Math.abs(s.roll))).toBeLessThan(0.01);
      for (const a of idleHeadAt(t)) expect(Math.abs(a)).toBeLessThan(0.06);
    }
  });

  it("el tronco gira hacia donde va la mano y se inclina cuando se adelanta", () => {
    expect(signLean({ hand: hand(0.1) })).toEqual({ yaw: 0, roll: 0, pitch: expect.any(Number) });
    expect(signLean({ hand: hand(-0.3) }).yaw).toBeLessThan(-0.03);
    expect(signLean({ hand: hand(0.5) }).yaw).toBeGreaterThan(0.03);
    expect(signLean({ hand: hand(0.1, 0.5) }).pitch).toBeGreaterThan(0.02);
    // Con las dos manos iguales a cada lado, no gira; y nunca pasa de unos grados.
    expect(signLean({ hand: hand(0.3), hand2: hand(0.3) }).yaw).toBe(0);
    expect(Math.abs(signLean({ hand: hand(5, 5) }).yaw)).toBeLessThan(0.07);
  });

  it("sigue a las manos con retraso y no depende de los fps", () => {
    const to = { yaw: 0.05, pitch: 0.02, roll: 0.01 };
    const once = easeLean(NO_LEAN, to, 220);
    expect(once.yaw).toBeCloseTo(0.05 * (1 - Math.exp(-1)));
    let step = NO_LEAN;
    for (let i = 0; i < 22; i++) step = easeLean(step, to, 10);
    expect(step.yaw).toBeCloseTo(once.yaw, 6);
  });

  it("los ojos deshacen el giro de la cabeza y del cuerpo hasta donde llegan", () => {
    expect(gazeFor(undefined, NO_LEAN)).toEqual([0, 0]);
    expect(gazeFor([0.1, 0, 0], NO_LEAN)[0]).toBeCloseTo(-0.1);
    expect(gazeFor([0.1, 0, 0], { ...NO_LEAN, yaw: 0.05 })[0]).toBeCloseTo(-0.15);
    expect(gazeFor([1, 1, 0], NO_LEAN)[0]).toBe(-GAZE_MAX);
    expect(Math.abs(gazeFor([0, 1, 0], NO_LEAN)[1])).toBeLessThanOrEqual(0.1);
  });

  it("de vez en cuando echa un vistazo corto a un lado; casi siempre mira al frente", () => {
    let away = 0;
    const n = 60000 / 20;
    for (let t = 0; t < 60000; t += 20) {
      const [yaw, pitch] = glanceAt(t);
      if (yaw !== 0) away++;
      expect(Math.abs(yaw)).toBeLessThan(0.08);
      expect(Math.abs(pitch)).toBeLessThan(0.02);
    }
    expect(away / n).toBeGreaterThan(0.03);
    expect(away / n).toBeLessThan(0.2);
  });
});
