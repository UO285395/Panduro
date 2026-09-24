import { describe, expect, it } from "vitest";
import { convertSample, type SwlFrame } from "@/lib/avatar/importSwl";

// Cámara de MediaPipe: la derecha del signante es -x, arriba -y y hacia la cámara -z.
type T = [number, number, number];
const s = (r: number, u: number, f: number): T => [-r, -u, -f];
const add = (a: T, b: T): T => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

function openHand(): T[] {
  // Mano abierta, dedos hacia arriba y palma hacia delante (vale para la orientación, no para una mano concreta).
  const pts: T[] = new Array(21).fill(0).map(() => [0, 0, 0] as T);
  const mcp: [number, number][] = [[5, -0.025], [9, 0], [13, 0.02], [17, 0.035]];
  for (const [i, r] of mcp) {
    for (let k = 0; k < 4; k++) pts[i + k] = s(r, 0.085 + 0.025 * k, 0);
  }
  for (let k = 1; k <= 4; k++) pts[k] = s(-0.03 - 0.012 * k, 0.02 * k, 0.01);
  return pts;
}

function frame(raisedSide: "right" | "left" | null): SwlFrame {
  const pose: [number, number, number, number][] = Array.from({ length: 17 }, () => [0, 0, 0, 1]);
  const set = (i: number, v: T) => (pose[i] = [...v, 1]);
  set(9, s(-0.03, 0.2, 0.1));
  set(10, s(0.03, 0.2, 0.1));
  set(11, s(-0.18, 0, 0));
  set(12, s(0.18, 0, 0));
  const raised = (side: 1 | -1) => ({ elbow: s(0.23 * side, -0.1, 0.26), wrist: s(0.28 * side, 0.16, 0.31) });
  const down = (side: 1 | -1) => ({ elbow: s(0.18 * side, -0.28, 0), wrist: s(0.18 * side, -0.55, 0) });
  const r = raisedSide === "right" ? raised(1) : down(1);
  const l = raisedSide === "left" ? raised(-1) : down(-1);
  set(14, r.elbow);
  set(16, r.wrist);
  set(13, l.elbow);
  set(15, l.wrist);
  const wristImage = (side: "left" | "right"): T => [side === "right" ? 0.3 : 0.7, raisedSide === side ? 0.4 : 0.8, 0];
  const hand = openHand();
  return {
    poseWorld: pose,
    wrists: [wristImage("left"), wristImage("right")],
    hands: raisedSide
      ? [{ world: hand, image: hand.map((p) => add([...wristImage(raisedSide)], [p[0], p[1], 0])) }]
      : [],
  };
}

const sequence = (side: "right" | "left") =>
  Array.from({ length: 30 }, (_, i) => frame(i >= 5 && i < 25 ? side : null));

describe("importSwl", () => {
  it("convierte una muestra de SWL-LSE en clip con la mano dominante", () => {
    const { result, leftHanded } = convertSample(sequence("right"), 30);
    expect(result.ok).toBe(true);
    expect(leftHanded).toBe(false);
    if (!result.ok) return;
    expect(result.clip.keyframes.length).toBeGreaterThan(2);
    expect(result.stats.durationMs).toBeGreaterThan(500);
  });

  it("detecta a los signantes zurdos y los pasa a la mano derecha del avatar", () => {
    const { result, leftHanded } = convertSample(sequence("left"), 30);
    expect(result.ok).toBe(true);
    expect(leftHanded).toBe(true);
  });
});
