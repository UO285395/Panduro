import { redirect } from "next/navigation";
import { getUserSnapshot } from "@/lib/progress/queries";
import { DEMO_MODE } from "@/lib/storage/flags";
import { listTranslations } from "@/lib/translator/persistence";
import { getSignsMap } from "@/lib/curriculum/loader";
import { TranslateView } from "./translate-view";

export const metadata = { title: "Traductor" };
export const dynamic = "force-dynamic";

function buildSignOptions() {
  const seen = new Set<string>();
  const out: { id: string; translation: string }[] = [];
  for (const [id, sign] of getSignsMap()) {
    const key = sign.translation.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ id, translation: sign.translation });
  }
  return out.sort((a, b) => a.translation.localeCompare(b.translation, "es"));
}

/** Signos del currículo; su animación se pide a /api/clips cuando hace falta enseñarla. */
function buildSignIds() {
  return [...getSignsMap().keys()];
}

export default async function TranslatePage() {
  const signIds = buildSignIds();
  const signOptions = buildSignOptions();
  if (DEMO_MODE) {
    return <TranslateView demo initialHistory={[]} signIds={signIds} signOptions={signOptions} />;
  }
  const snapshot = await getUserSnapshot();
  if (!snapshot) redirect("/login");
  const history = await listTranslations(10);
  return <TranslateView initialHistory={history} signIds={signIds} signOptions={signOptions} />;
}
