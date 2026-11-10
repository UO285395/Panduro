import { describe, expect, it } from "vitest";
import { CHANNELS, IDLE_GREETING_MS, handTarget, restAt, stepHand, type HandMood, type HandPose } from "@/lib/mascot/handPose";

const MOODS: HandMood[] = ["idle", "correct", "incorrect", "celebrate"];
const fingers = (p: HandPose) => [p.index, p.middle, p.ring, p.pinky];

/** La mano en `mood` tras `ms`, partiendo del reposo, a 60 fps. */
function play(mood: HandMood, ms: number, still = false) {
  const state = restAt(handTarget("idle", 0, 0, still));
  const seen: HandPose[] = [];
  for (let t = 0; t <= ms; t += 1000 / 60) {
    stepHand(state, handTarget(mood, t, t, still), 1000 / 60, still);
    seen.push({ ...state.pos });
  }
  return { state, seen };
}

describe("handTarget: a dónde va la mano", () => {
  it("en reposo está abierta, con los dedos hacia arriba y en cascada", () => {
    const p = handTarget("idle", 1000, 1000);
    expect(p.tilt).toBeCloseTo(-Math.PI / 2);
    expect(p.thumb).toBe(0);
    expect(Math.max(...fingers(p))).toBeLessThan(0.2);
    expect(p.pinky).toBeGreaterThan(p.index);
  });

  it("recién montada saluda enseguida: el antebrazo se mece y la mano lo sigue, más abierta", () => {
    const calm = handTarget("idle", 1000, 0);
    let sway = 0;
    let wrist = 0;
    let spread = 0;
    for (let t = 0; t < 2500; t += 20) {
      const p = handTarget("idle", IDLE_GREETING_MS + t, 0);
      sway = Math.max(sway, Math.abs(p.sway));
      wrist = Math.max(wrist, Math.abs(p.wrist));
      spread = Math.max(spread, p.spread);
    }
    expect(sway).toBeGreaterThan(0.1);
    expect(wrist).toBeGreaterThan(0.2);
    expect(spread).toBeGreaterThan(calm.spread + 0.4);
  });

  it("al acertar cierra los dedos desde el meñique y saca el pulgar lo último", () => {
    const early = handTarget("correct", 30, 0);
    expect(early.pinky).toBe(1);
    expect(early.index).toBeLessThan(0.2);
    expect(early.thumb).toBe(0);
    // Antes de salir coge impulso: se encoge y gira un poco al revés.
    expect(early.tilt).toBeLessThan(-Math.PI / 2);
    expect(early.squash).toBeGreaterThan(0);
    const done = handTarget("correct", 1200, 0);
    expect(fingers(done)).toEqual([1, 1, 1, 1]);
    expect(done.thumb).toBe(1);
    expect(done.tilt).toBeCloseTo(0, 0);
    expect(done.z).toBeGreaterThan(0);
  });

  it("al fallar gira hacia el otro lado (pulgar abajo, se siguen viendo los dedos) y se aparta", () => {
    const p = handTarget("incorrect", 2000, 0);
    expect(p.tilt).toBeCloseTo(-Math.PI, 0);
    expect(p.roll).toBe(0);
    expect(p.thumb).toBe(1);
    expect(fingers(p)).toEqual([1, 1, 1, 1]);
    expect(p.z).toBeLessThan(0);
  });

  it("al celebrar salta con una vuelta entera y luego aplaude con la mano abierta, una y otra vez", () => {
    expect(handTarget("celebrate", 400, 0).bob).toBeGreaterThan(0.1);
    expect(handTarget("celebrate", 900, 0).spin).toBeCloseTo(2 * Math.PI);
    for (const t of [1800, 1800 + 5600, 1800 + 2 * 5600]) {
      const p = handTarget("celebrate", t, 0);
      expect(p.tilt).toBeCloseTo(-Math.PI / 2);
      expect(p.spread).toBe(1);
      expect(Math.max(...fingers(p))).toBeLessThan(0.1);
    }
    // El aplauso: la muñeca gira a un lado y a otro.
    const rolls = Array.from({ length: 60 }, (_, k) => handTarget("celebrate", 1300 + k * 20, 0).roll);
    expect(Math.max(...rolls)).toBeGreaterThan(0.5);
    expect(Math.min(...rolls)).toBeLessThan(-0.5);
    // Entre aplauso y aplauso, pulgar arriba.
    expect(handTarget("celebrate", 4000, 0)).toMatchObject({ thumb: 1, index: 1, pinky: 1 });
  });

  it("con movimiento reducido solo cambia de postura", () => {
    for (const mood of MOODS) {
      for (let t = 0; t < 8000; t += 90) {
        const p = handTarget(mood, t, t, true);
        for (const c of ["bob", "sway", "spin", "roll", "squash", "wrist"] as const) expect(Math.abs(p[c])).toBe(0);
      }
    }
    expect(handTarget("correct", 0, 0, true)).toMatchObject({ thumb: 1, index: 1 });
  });

  it("no da valores raros en ningún instante", () => {
    for (const mood of MOODS) {
      for (let t = 0; t < 20000; t += 37) {
        const p = handTarget(mood, t, t * 1.3);
        for (const c of CHANNELS) expect(Number.isFinite(p[c])).toBe(true);
        expect(Math.abs(p.bob)).toBeLessThan(0.3);
        expect(Math.abs(p.squash)).toBeLessThan(0.25);
      }
    }
  });
});

describe("stepHand: los muelles", () => {
  it("llega a la pose y se queda quieta", () => {
    const { state } = play("correct", 4000, true);
    const goal = handTarget("correct", 4000, 4000, true);
    for (const c of CHANNELS) {
      expect(state.pos[c]).toBeCloseTo(goal[c], 2);
      expect(Math.abs(state.vel[c])).toBeLessThan(0.01);
    }
  });

  it("el pulgar se pasa un poco al salir y vuelve (rebote); con movimiento reducido, no", () => {
    const lively = play("correct", 1500).seen.map((p) => p.thumb);
    expect(Math.max(...lively)).toBeGreaterThan(1.05);
    expect(Math.max(...lively)).toBeLessThan(1.4);
    const calm = play("correct", 1500, true).seen.map((p) => p.thumb);
    expect(Math.max(...calm)).toBeLessThanOrEqual(1.0001);
  });

  it("al girar deprisa la mano se queda atrás respecto a la manga", () => {
    const wrist = play("correct", 600).seen.map((p) => p.wrist);
    expect(Math.max(...wrist.map(Math.abs))).toBeGreaterThan(0.08);
    expect(Math.max(...wrist.map(Math.abs))).toBeLessThan(0.7);
  });

  it("no depende de los fps ni se dispara con un fotograma largo", () => {
    const at = (fps: number) => {
      const state = restAt(handTarget("idle", 0, 0));
      for (let t = 0; t <= 800; t += 1000 / fps) stepHand(state, handTarget("correct", t, 0), 1000 / fps);
      return state.pos;
    };
    const [fast, slow] = [at(120), at(30)];
    expect(slow.tilt).toBeCloseTo(fast.tilt, 1);
    expect(slow.thumb).toBeCloseTo(fast.thumb, 1);
    // Una pestaña que vuelve tras un rato: el paso se recorta y nada explota.
    const state = restAt(handTarget("idle", 0, 0));
    stepHand(state, handTarget("celebrate", 500, 0), 60_000);
    for (const c of CHANNELS) expect(Math.abs(state.pos[c])).toBeLessThan(10);
  });

  it("la vuelta de la celebración no se deshace al volver al reposo", () => {
    const { state } = play("celebrate", 1500);
    expect(state.pos.spin).toBeCloseTo(2 * Math.PI, 1);
    stepHand(state, handTarget("idle", 0, 0), 16);
    expect(Math.abs(state.pos.spin)).toBeLessThan(0.3);
  });
});
