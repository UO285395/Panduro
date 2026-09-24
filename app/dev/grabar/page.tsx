import captured from "@/content/signs/captured.json";
import { getAllLevels } from "@/lib/curriculum/loader";
import { RecordView, type SignOption } from "./record-view";

export const metadata = { title: "Grabar signos · dev" };
export const dynamic = "force-dynamic";

export default function Page({ searchParams }: { searchParams: { sign?: string } }) {
  const recorded = new Set(Object.keys(captured.signs));
  const seen = new Set<string>();
  const signs: SignOption[] = [];
  for (const level of getAllLevels()) {
    for (const s of level.signs) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      signs.push({
        id: s.id,
        translation: s.translation,
        description: s.description ?? "",
        level: level.id,
        recorded: recorded.has(s.id),
      });
    }
  }

  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">Dev · Datos reales</p>
        <h1 className="text-2xl font-bold">Grabar signos</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Graba un signo con la cámara o desde un vídeo. Se extraen la posición de los brazos, la
          forma y la orientación de las manos, y se convierten en la animación del avatar y en
          plantillas de reconocimiento. Nada sale de tu navegador hasta que descargas el archivo.
        </p>
      </header>
      <RecordView signs={signs} initialSign={searchParams.sign} />
    </main>
  );
}
