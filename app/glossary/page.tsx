import { getAllLevels } from "@/lib/curriculum/structure";
import { GlossaryView } from "./glossary-view";

export const metadata = { title: "Glosario de signos" };

/** Sin animaciones: cada tarjeta pide la suya a /api/clips cuando aparece en pantalla. */
export default function GlossaryPage() {
  const levels = getAllLevels();

  const signsByLevel = levels.map((lvl) => ({
    levelId: lvl.id,
    levelTitle: lvl.title,
    signs: lvl.signs.map((s) => ({
      id: s.id,
      gloss: s.gloss,
      translation: s.translation,
      description: s.description ?? null,
    })),
  }));

  return <GlossaryView signsByLevel={signsByLevel} />;
}
