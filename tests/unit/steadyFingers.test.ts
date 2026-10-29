import { describe, expect, it } from "vitest";
import { steadyFingers, steadySeries } from "@/lib/avatar/steadyFingers";
import type { AvatarClip, AvatarKeyframe } from "@/lib/curriculum/schema";

const t = (n: number) => Array.from({ length: n }, (_, k) => k * 100);

describe("steadySeries: el temblor de una medida a lo largo del clip", () => {
  it("quita un pico de un solo fotograma", () => {
    const out = steadySeries([0.2, 0.2, 0.2, 1.4, 0.2, 0.2, 0.2], t(7));
    for (const v of out) expect(v!).toBeCloseTo(0.2, 6);
  });

  it("un cambio que dura varios fotogramas se queda (solo se suaviza el paso)", () => {
    const out = steadySeries([0, 0, 0, 1, 1, 1, 1], t(7)) as number[];
    expect(out[0]).toBeCloseTo(0, 2);
    expect(out[6]).toBeCloseTo(1, 2);
    expect(out[2]!).toBeLessThan(out[3]!);
    expect(out[3]!).toBeGreaterThan(0.6);
  });

  it("los huecos siguen siendo huecos y no rompen a los vecinos", () => {
    const out = steadySeries([0.5, null, 0.5, 0.5], t(4));
    expect(out[1]).toBeNull();
    expect(out[0]).toBeCloseTo(0.5, 6);
  });

  it("dos fotogramas muy separados no cuentan como vecinos", () => {
    // Un pico en un fotograma suelto (a 500 ms de los otros) es una forma de verdad, no temblor.
    const out = steadySeries([0, 1, 0], [0, 500, 1000]);
    expect(out).toEqual([0, 1, 0]);
  });
});

describe("steadyFingers: los dedos grabados de un clip", () => {
  const kf = (k: number, index: number): AvatarKeyframe =>
    ({
      t: k * 100,
      hand: { x: 0, y: 0, z: 0 },
      fingers: [0.5, [0.1, 0.2, index], { flex: 1 }, 0, 0],
      ...(k === 2 ? { thumbTip: [0.1, 0.2, 0.3] } : {}),
    }) as AvatarKeyframe;
  const clip = {
    duration: 600,
    handedness: "one",
    keyframes: [0.3, 0.3, 1.5, 0.3, 0.3, 0.3].map((b, k) => kf(k, b)),
  } as unknown as AvatarClip;

  it("suaviza lo medido y deja igual lo escrito a mano", () => {
    const out = steadyFingers(clip);
    const index = out.keyframes.map((k) => (k.fingers[1] as number[])[2]!);
    for (const b of index) expect(b).toBeCloseTo(0.3, 3);
    expect(out.keyframes[2]!.fingers[0]).toBe(0.5);
    expect(out.keyframes[2]!.fingers[2]).toEqual({ flex: 1 });
  });

  it("no inventa lo que el keyframe no tenía", () => {
    const out = steadyFingers(clip);
    expect(out.keyframes[1]!.thumbTip).toBeUndefined();
    expect(out.keyframes[2]!.thumbTip).toEqual([0.1, 0.2, 0.3]);
    expect(out.keyframes[0]!.fingers2).toBeUndefined();
  });
});
