import Link from "next/link";

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
        </div>
      </section>

      <footer className="text-xs text-slate-500 dark:text-slate-400">
        <p>
          Un proyecto validado con la comunidad sorda. LSE ≠ ASL. Ley 27/2007 de
          reconocimiento de las lenguas de signos españolas.
        </p>
      </footer>
    </main>
  );
}
