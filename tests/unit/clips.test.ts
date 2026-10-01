// @vitest-environment node
import { describe, expect, it } from "vitest";
import captured from "@/content/signs/captured.json";
import { GET, generateStaticParams } from "@/app/api/clips/[id]/route";
import { getSignsMap } from "@/lib/curriculum/loader";
import type { SignAnimation } from "@/lib/curriculum/schema";

async function fetchClip(id: string) {
  return GET(new Request(`http://localhost/api/clips/${id}`), { params: { id } });
}

describe("/api/clips/[id]: la animación de cada signo, aparte de las páginas", () => {
  it("genera un JSON estático por cada signo grabado del currículo", () => {
    const ids = new Set(generateStaticParams().map((p) => p.id));
    const recorded = Object.keys(captured.signs).filter((id) => getSignsMap().has(id));
    expect(recorded.length).toBeGreaterThan(300);
    for (const id of recorded) expect(ids.has(id), id).toBe(true);
  });

  it("sirve la grabación de un signo capturado con el crédito del DILSE", async () => {
    const res = await fetchClip("HOLA");
    expect(res.status).toBe(200);
    const body = (await res.json()) as SignAnimation;
    expect(body.avatarClip).toEqual(captured.signs.HOLA.avatarClip);
    expect(body.animationCredit).toEqual({
      source: captured.signs.HOLA.source,
      license: captured.signs.HOLA.license,
      url: captured.signs.HOLA.url,
    });
    expect(body.animationCredit?.url).toMatch(/^https:\/\/fundacioncnse-dilse\.org\//);
  });

  it("responde 404 si el signo no existe", async () => {
    const res = await fetchClip("NO_EXISTE");
    expect(res.status).toBe(404);
  });
});
