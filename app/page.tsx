import Link from "next/link";
import { DEMO_MODE } from "@/lib/storage/flags";
import { DemoStartButton } from "./demo-start-button";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-3xl flex-col justify-between px-6 py-12">
      <header className="flex items-center justify-between">
        <span className="text-lg font-bold text-brand-700">Panduro</span>
        <nav className="flex gap-4 text-sm">
          <Link href="/login" className="hover:underline">
            Entrar
          </Link>
          <Link
            href="/register"
            className="rounded-full bg-brand-600 px-4 py-1.5 font-medium text-white hover:bg-brand-700"
          >
            Crear cuenta
          </Link>
        </nav>
      </header>

      <section className="my-16 space-y-8">
        <h1 className="text-4xl font-bold leading-tight sm:text-5xl">
          Aprende <span className="text-brand-600">Lengua de Signos Española</span>{" "}
          jugando cada día.
        </h1>
        <p className="text-lg text-slate-600 dark:text-slate-300">
          Lecciones cortas, gamificadas y con feedback por cámara. Contenido
          desarrollado con profesorado sordo nativo y alineado con el currículo
          oficial LSE (MCER A1–B2).
        </p>
        <div className="flex flex-wrap gap-3">
          {DEMO_MODE ? (
            <DemoStartButton />
          ) : (
            <>
              <Link
                href="/register"
                className="rounded-full bg-brand-600 px-6 py-3 font-semibold text-white shadow-sm hover:bg-brand-700"
              >
                Empezar gratis
              </Link>
              <Link
                href="/login"
                className="rounded-full border border-slate-300 px-6 py-3 font-semibold hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
              >
                Ya tengo cuenta
              </Link>
            </>
          )}
        </div>
        {DEMO_MODE && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Modo demo activo: la app funciona sin backend. Tu progreso se guarda
            en este navegador.
          </p>
        )}
      </section>

      <section className="mb-12 space-y-3 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm dark:border-amber-800 dark:bg-amber-950/40">
        <h2 className="font-semibold text-amber-900 dark:text-amber-100">
          Estado del proyecto · MVP técnico
        </h2>
        <p className="text-amber-900/90 dark:text-amber-100/90">
          Este MVP se ha construido antes de una validación lingüística formal
          con asesoría sorda certificada. El corpus, las traducciones y las
          animaciones del avatar son aproximaciones basadas en fuentes públicas
          (DILSE, Spreadthesign). No debe usarse todavía como material educativo
          oficial; su propósito actual es probar la infraestructura técnica.
          Antes de una beta pública se cerrará la alianza con Fundación CNSE /
          CNLSE.
        </p>
        <p className="text-xs text-amber-800/80 dark:text-amber-200/80">
          Ver{" "}
          <Link href="/CREDITS.md" className="underline">
            CREDITS
          </Link>{" "}
          para las fuentes lingüísticas usadas.
        </p>
      </section>

      <footer className="text-xs text-slate-500 dark:text-slate-400">
        <p>
          LSE ≠ ASL. Ley 27/2007 de reconocimiento de las lenguas de signos
          españolas.
        </p>
      </footer>
    </main>
  );
}
