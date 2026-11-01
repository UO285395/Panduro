import Link from "next/link";
import { getAllLevels } from "@/lib/curriculum/loader";
import { AuditView } from "./audit-view";

export const metadata = { title: "Auditar signos · dev" };

export default function Page() {
  const ids = new Set<string>();
  for (const level of getAllLevels()) {
    for (const sign of level.signs) if (sign.avatarClip && sign.animationCredit) ids.add(sign.id);
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Dev</p>
        <h1 className="text-2xl font-bold">Auditar signos</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Saca el esqueleto del avatar (las dos manos, los brazos y la cara) mientras hace cada signo
          grabado, para compararlo con el vídeo del que salió:{" "}
          <code className="text-xs">python scripts/audit_signs.py esqueletos-avatar.json</code> escribe{" "}
          <code className="text-xs">content/signs/audit.json</code>, que ordena{" "}
          <Link href="/dev/revisar" className="underline hover:text-brand-600">
            /dev/revisar
          </Link>{" "}
          por lo que más se aparta del vídeo. Ver docs/avatar.md.
        </p>
      </header>
      <AuditView ids={[...ids].sort()} />
    </main>
  );
}
