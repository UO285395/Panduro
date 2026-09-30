import { describe, expect, it } from "vitest";
import type { AvatarClip, AvatarKeyframe } from "@/lib/curriculum/schema";
import { composeClips, PHRASE_GAP_MS } from "@/lib/avatar/compose";

const kf = (t: number, y: number, extra: Partial<AvatarKeyframe> = {}): AvatarKeyframe => ({
  t,
  hand: { x: 0.1, y, z: 0, rot: [0, 0, 0] },
  fingers: [0, 0, 0, 0, 0],
  ...extra,
});

/** Un signo aislado: sube desde el reposo, signa arriba y vuelve a bajar. */
const sign = (ys: number[], extra: (i: number) => Partial<AvatarKeyframe> = () => ({})): AvatarClip => ({
  handedness: "one",
  duration: (ys.length - 1) * 100,
  keyframes: ys.map((y, i) => kf(i * 100, y, extra(i))),
});

describe("composeClips: frases con signos grabados", () => {
  it("encadena los signos sin volver al reposo entre ellos", () => {
    const a = sign([-0.3, 0.1, 0.5, 0.5, 0.1, -0.3]);
    const b = sign([-0.3, 0.2, 0.6, 0.2, -0.3]);
    const c = composeClips([a, b]);
    const ys = c.keyframes.map((k) => k.hand.y);
    // Del primero, la subida y lo de arriba (sin la bajada del todo); del segundo, desde que sube.
    expect(ys).toEqual([-0.3, 0.1, 0.5, 0.5, 0.1, 0.2, 0.6, 0.2, -0.3]);
    // Tiempos crecientes, con la pausa entre los dos.
    const ts = c.keyframes.map((k) => k.t);
    expect(ts.every((t, i) => i === 0 || t > ts[i - 1]!)).toBe(true);
    expect(ts[5]! - ts[4]!).toBe(PHRASE_GAP_MS);
    expect(c.duration).toBe(ts[ts.length - 1]);
    expect(c.handedness).toBe("one");
  });

  it("con un signo a una mano y otro a dos, la pasiva descansa en el de una", () => {
    const a = sign([-0.3, 0.5, 0.5, -0.3]);
    const b: AvatarClip = {
      ...sign([-0.3, 0.5, 0.5, -0.3], (i) => ({
        hand2: { x: 0.1, y: [-0.35, 0.4, 0.4, -0.3][i]!, z: 0, rot: [0, 0, 0] },
        fingers2: [1, 1, 1, 1, 1],
      })),
      handedness: "two",
    };
    const c = composeClips([a, b]);
    expect(c.handedness).toBe("two");
    expect(c.keyframes.every((k) => k.hand2)).toBe(true);
    // Durante el primero, abajo junto al cuerpo y con la mano relajada, no con la forma del segundo.
    const first = c.keyframes[0]!;
    expect(first.hand2!.y).toBeLessThan(-0.2);
    expect(first.hand2!.z).toBeLessThan(0);
    expect(first.hand2!.contact).toBeUndefined();
    expect(first.fingers2!.every((f) => typeof f === "number" && f < 0.3)).toBe(true);
    // Durante el segundo, su propia pasiva.
    expect(c.keyframes.at(-2)!.hand2!.y).toBe(0.4);
  });

  it("el cuerpo girado solo si lo está igual en todos los signos", () => {
    const a = { ...sign([-0.3, 0.5, -0.3]), bodyYaw: 0.4 };
    expect(composeClips([a, { ...sign([-0.3, 0.5, -0.3]), bodyYaw: 0.44 }]).bodyYaw).toBeCloseTo(0.42, 2);
    expect(composeClips([a, sign([-0.3, 0.5, -0.3])]).bodyYaw).toBeUndefined();
  });
});
