import { getAllLevels } from "@/lib/curriculum/loader";
import { GlossaryView } from "./glossary-view";

export const metadata = { title: "Glosario de signos" };

export default function GlossaryPage() {
  const levels = getAllLevels();

  // Sin las animaciones: la lista solo enseña las palabras y cada ficha carga la suya.
  const signsByLevel = levels.map((lvl) => ({
    levelId: lvl.id,
    levelTitle: lvl.title,
    signs: lvl.signs.map((s) => ({
      id: s.id,
      gloss: s.gloss,
      translation: s.translation,
      description: s.description ?? null,
      twoHands: s.handedness === "two",
    })),
  }));

  return <GlossaryView signsByLevel={signsByLevel} />;
}
