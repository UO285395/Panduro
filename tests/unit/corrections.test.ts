import { describe, expect, it } from "vitest";
import corrections from "@/content/signs/corrections.json";
import { SHAPES, applyCorrections, type Corrections } from "@/lib/avatar/corrections";
import { getSign } from "@/lib/curriculum/loader";
import type { AvatarClip } from "@/lib/curriculum/schema";

const clip = {
  handedness: "two",
  duration: 400,
  keyframes: [0, 200, 400].map((t) => ({
    t,
    hand: { x: 0.1, y: 0.3, z: 0.2, rot: [0, 0, 0], palmDir: [0, 0, 1], contact: { at: "chin", with: "tips" } },
    hand2: { x: 0.1, y: 0.3, z: 0.2, rot: [0, 0, 0] },
    fingers: [0.5, 0.5, 0.5, 0.5, 0.5],
    fingers2: [0.5, 0.5, 0.5, 0.5, 0.5],
    thumbTip: [0, 0, 1],
  })),
} as unknown as AvatarClip;

describe("correcciones a mano de signos grabados", () => {
  it("solo toca el tramo y la mano que dice el parche, y no cambia el clip original", () => {
    const out = applyCorrections(clip, [{ from: 100, to: 300, hand: "dom", shape: "flat", noContact: true }]);
    expect(out.keyframes[0]).toEqual(clip.keyframes[0]);
    expect(out.keyframes[2]).toEqual(clip.keyframes[2]);
    const mid = out.keyframes[1]!;
    expect(mid.fingers).toEqual(SHAPES.flat.fingers);
    expect(mid.fingers2).toEqual([0.5, 0.5, 0.5, 0.5, 0.5]);
    expect(mid.hand.contact).toBeUndefined();
    expect(mid.thumbTip).toBeUndefined();
    expect(clip.keyframes[1]!.hand.contact).toBeDefined();
  });

  it("la orientación de la mano pasiva va en espejo y el anillo lleva su pinza", () => {
    const out = applyCorrections(clip, [{ shape: "ring", palmDir: [-1, 0.5, 0], x: -0.2 }]);
    const kf = out.keyframes[1]!;
    expect(kf.hand.palmDir).toEqual([-1, 0.5, 0]);
    expect(kf.hand2!.palmDir).toEqual([1, 0.5, 0]);
    expect(kf.hand.x).toBe(-0.2);
    expect(kf.thumbTouch).toEqual([1, 0, 0, 0]);
    expect(kf.thumbTouch2).toEqual([1, 0, 0, 0]);
  });

  it("cada corrección es de un signo grabado, dice por qué y se aplica al cargarlo", () => {
    for (const [id, fix] of Object.entries(corrections as unknown as Corrections)) {
      expect(fix.why.length).toBeGreaterThan(20);
      expect(fix.patches.length).toBeGreaterThan(0);
      for (const p of fix.patches) if (p.shape) expect(SHAPES[p.shape]).toBeDefined();
      expect(getSign(id)?.avatarClip, id).toBeDefined();
    }
    const ayudar = getSign("AYUDAR")!.avatarClip!;
    expect(ayudar.keyframes.find((k) => k.t === 600)!.fingers).toEqual(SHAPES.flat.fingers);
  });
});
