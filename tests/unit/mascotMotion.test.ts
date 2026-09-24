import { describe, expect, it } from "vitest";
import { MOOD_MS, mascotPose, pickClip } from "@/lib/mascot/modelMotion";

describe("mascotPose", () => {
  it("en reposo apenas se mueve", () => {
    for (let t = 0; t < 5000; t += 250) {
      const p = mascotPose("idle", t, t);
      expect(Math.abs(p.y)).toBeLessThan(0.02);
      expect(Math.abs(p.rotZ)).toBeLessThan(0.05);
    }
  });

  it("al acertar salta y vuelve al reposo sin tirón", () => {
    const peak = Math.max(...Array.from({ length: 50 }, (_, i) => mascotPose("correct", (i / 50) * MOOD_MS.correct, 0).y));
    expect(peak).toBeGreaterThan(0.15);
    const end = mascotPose("correct", MOOD_MS.correct - 1, 1000);
    const rest = mascotPose("idle", 0, 1000);
    expect(end.y).toBeCloseTo(rest.y, 2);
    expect(mascotPose("correct", MOOD_MS.correct + 500, 1000)).toEqual(mascotPose("idle", 0, 1000));
  });

  it("al fallar niega con la cabeza, al celebrar da una vuelta entera", () => {
    const turns = Array.from({ length: 40 }, (_, i) => mascotPose("incorrect", (i / 40) * MOOD_MS.incorrect, 0).rotY);
    expect(Math.max(...turns)).toBeGreaterThan(0.2);
    expect(Math.min(...turns)).toBeLessThan(-0.2);
    expect(mascotPose("celebrate", MOOD_MS.celebrate * 0.6, 0).rotY).toBeCloseTo(2 * Math.PI, 1);
  });
});

describe("pickClip", () => {
  const clips = [{ name: "Idle_Loop" }, { name: "Walk" }, { name: "Wave_Hello" }, { name: "Shake_No" }];
  it("elige la animación del modelo que encaja con cada estado", () => {
    expect(pickClip(clips, "idle")?.name).toBe("Idle_Loop");
    expect(pickClip(clips, "correct")?.name).toBe("Wave_Hello");
    expect(pickClip(clips, "incorrect")?.name).toBe("Shake_No");
    expect(pickClip(clips, "celebrate")?.name).toBe("Walk");
    expect(pickClip([{ name: "Take 001" }], "celebrate")?.name).toBe("Take 001");
    expect(pickClip([], "idle")).toBeNull();
  });
});
