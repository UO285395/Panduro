import { redirect } from "next/navigation";
import { getUserSnapshot } from "@/lib/progress/queries";
import { DEMO_MODE } from "@/lib/storage/flags";
import { listTranslations } from "@/lib/translator/persistence";
import { TranslateView } from "./translate-view";

export const metadata = { title: "Traductor" };
export const dynamic = "force-dynamic";

export default async function TranslatePage() {
  if (DEMO_MODE) {
    return <TranslateView demo initialHistory={[]} />;
  }
  const snapshot = await getUserSnapshot();
  if (!snapshot) redirect("/login");
  const history = await listTranslations(10);
  return <TranslateView initialHistory={history} />;
}
