import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { MEDIAPIPE_TASKS_VISION_VERSION } from "@/lib/mediapipe/constants";

describe("MediaPipe", () => {
  it("la WASM del CDN es de la misma versión que el paquete instalado", () => {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), "node_modules/@mediapipe/tasks-vision/package.json"), "utf8"),
    ) as { version: string };
    expect(MEDIAPIPE_TASKS_VISION_VERSION).toBe(pkg.version);
  });
});
