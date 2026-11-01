import Link from "next/link";
import audit from "@/content/signs/audit.json";
import dilseVideos from "@/content/signs/dilse-videos.json";
import { PHRASES } from "@/lib/avatar/compose";
import { getAllLevels } from "@/lib/curriculum/loader";
import { ReviewView, type ReviewSign, type SignAudit } from "./review-view";

export const metadata = { title: "Revisar signos · dev" };

/** Signos que ya se habían dado por buenos al afinar el avatar (ver docs/avatar.md). */
const APPROVED = new Set([
  "CASA", "ESPERAR", "MEDICO", "PROGRAMA", "HOLA", "TELEFONO", "PADRE", "OREJA",
  "ESCUCHAR", "PENSAR", "LLUVIA", "GRACIAS", "BIEN", "NARIZ", "DESCUBRIR", "NUM_18",
]);

/** Lo que más se aparta del vídeo en cada signo (scripts/audit_signs.py). */
const AUDIT = (audit as unknown as { signs: Record<string, SignAudit> }).signs;

export default function Page() {
  const videos = dilseVideos.videos as Record<string, string[]>;
  const seen = new Set<string>();
  const signs: ReviewSign[] = [];
  for (const level of getAllLevels()) {
    for (const sign of level.signs) {
      if (seen.has(sign.id) || !sign.avatarClip) continue;
      seen.add(sign.id);
      const urls = videos[sign.id] ?? [];
      const parts = PHRASES[sign.id] ?? [sign.id];
      signs.push({
        id: sign.id,
        translation: sign.translation,
        gloss: sign.gloss,
        levelId: level.id,
        description: sign.description ?? null,
        recorded: !!sign.animationCredit,
        pageUrl: sign.animationCredit?.url ?? null,
        approved: APPROVED.has(sign.id),
        audit: AUDIT[sign.id] ?? null,
        video: urls.length === parts.length ? parts.map((id, k) => ({ id, url: urls[k]! })) : [],
      });
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Dev</p>
        <h1 className="text-2xl font-bold">Revisar signos</h1>
        <p className="max-w-3xl text-sm text-slate-600 dark:text-slate-400">
          El vídeo del DILSE junto al avatar. Marca cada signo como <strong>bien</strong>,{" "}
          <strong>con dudas</strong> o <strong>mal</strong> y, si algo falla, qué es. Lo que marques
          se guarda en este navegador; al terminar (o cuando quieras), exporta el archivo y pásalo
          para corregir los signos. Por defecto van primero los que más se apartan del vídeo según la
          comparación automática (<Link href="/dev/auditar" className="underline hover:text-brand-600">/dev/auditar</Link>).
        </p>
      </header>
      <ReviewView signs={signs} />
    </main>
  );
}
