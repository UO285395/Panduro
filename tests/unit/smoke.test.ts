import { describe, expect, it } from "vitest";

describe("smoke", () => {
  it("suma dos números", () => {
    expect(1 + 1).toBe(2);
  });

  it("expone process.env en el entorno de test", () => {
    process.env.PANDURO_TEST_VAR = "ok";
    expect(process.env.PANDURO_TEST_VAR).toBe("ok");
  });
});
