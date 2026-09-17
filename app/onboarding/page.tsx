import { redirect } from "next/navigation";
import { getUserSnapshot } from "@/lib/progress/queries";
import { getSign } from "@/lib/curriculum/loader";
import { DEMO_MODE } from "@/lib/storage/flags";
import { OnboardingView } from "./onboarding-view";

export const metadata = { title: "Bienvenida" };
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const hola = getSign("HOLA");
  if (DEMO_MODE) {
    return <OnboardingView demo helloClip={hola?.avatarClip ?? null} />;
  }
  const snapshot = await getUserSnapshot();
  if (!snapshot) redirect("/login");
  if (snapshot.onboardingCompleted) redirect("/dashboard");
  return <OnboardingView helloClip={hola?.avatarClip ?? null} />;
}
