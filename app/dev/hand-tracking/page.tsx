import { HandTrackingView } from "./hand-tracking-view";

export const metadata = { title: "Hand tracking · dev" };
export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      <header className="space-y-1">
        <p className="text-xs font-semibold uppercase tracking-wider text-brand-600">
          Dev · Hito 3
        </p>
        <h1 className="text-2xl font-bold">Hand tracking en tiempo real</h1>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Prueba interna del pipeline MediaPipe. Enseña una mano a la cámara y
          verás los 21 landmarks superpuestos. Todo el procesado ocurre en tu
          navegador; ningún frame se sube.
        </p>
      </header>
      <HandTrackingView />
    </main>
  );
}
