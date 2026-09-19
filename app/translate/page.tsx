import { redirect } from "next/navigation";
import { getUserSnapshot } from "@/lib/progress/queries";
import { DEMO_MODE } from "@/lib/storage/flags";
import { listTranslations } from "@/lib/translator/persistence";
import { getSignsMap } from "@/lib/curriculum/loader";
import { TranslateView } from "./translate-view";

export const metadata = { title: "Traductor" };
export const dynamic = "force-dynamic";

function buildClipsMap() {
  const signsMap = getSignsMap();
  const out: Record<string, import("@/lib/curriculum/schema").AvatarClip | null> = {};
  for (const [id, sign] of signsMap) {
    out[id] = sign.avatarClip ?? null;
  }
  return out;
}

export default async function TranslatePage() {
  const clipsMap = buildClipsMap();
  if (DEMO_MODE) {
    return <TranslateView demo initialHistory={[]} clipsMap={clipsMap} />;
  }
  const snapshot = await getUserSnapshot();
  if (!snapshot) redirect("/login");
  const history = await listTranslations(10);
  return <TranslateView initialHistory={history} clipsMap={clipsMap} />;
}
