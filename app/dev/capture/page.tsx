import { CaptureView } from "./capture-view";

export const metadata = { title: "Capturar plantillas · dev" };
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-8 space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
          Dev · Hito 4
        </p>
        <h1 className="text-2xl font-bold">Capturar plantillas de dactilología</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Muestra a la cámara cada letra del alfabeto LSE y pulsa la letra que
          estás signando. Las plantillas se guardan localmente y puedes
          exportarlas como JSON para pegarlas en{" "}
          <code>content/signs/fingerspelling.json</code>.
        </p>
      </header>
      <CaptureView />
    </main>
  );
}
