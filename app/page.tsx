import Link from "next/link";
import { Icon, type IconName } from "@/components/ui/Icon";
import { Logo } from "@/components/ui/Logo";
import { getAllLevels } from "@/lib/curriculum/loader";
import { DEMO_MODE } from "@/lib/storage/flags";
import { DemoStartButton } from "./demo-start-button";
import { HeroStage, type HeroSign } from "./hero-stage";

/** Signos del escenario de la portada (de los ya revisados frente al vídeo). */
const HERO_SIGNS: HeroSign[] = [
  { id: "HOLA", word: "Hola" },
  { id: "GRACIAS", word: "Gracias" },
  { id: "BIEN", word: "Bien" },
  { id: "CASA", word: "Casa" },
];

const STEPS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "play",
    title: "Mira el signo",
    text: "Un avatar 3D lo signa delante de ti, a velocidad normal o lenta, tantas veces como quieras.",
  },
  {
    icon: "check",
    title: "Practica",
    text: "Ejercicios de un minuto: elegir el significado, emparejar, escribir y reconocer el signo correcto.",
  },
  {
    icon: "camera",
    title: "Signa con tu cámara",
    text: "La cámara mira tus manos y te dice si lo has hecho bien. Funciona en tu navegador: el vídeo no se envía.",
  },
];

function curriculumFacts() {
  const levels = getAllLevels();
  const signs = new Map<string, boolean>();
  let lessons = 0;
  for (const level of levels) {
    for (const unit of level.units) lessons += unit.lessons.length;
    for (const sign of level.signs) signs.set(sign.id, signs.get(sign.id) || /DILSE/i.test(sign.animationCredit?.source ?? ""));
  }
  const fromDilse = [...signs.values()].filter(Boolean).length;
  return [
    { value: String(fromDilse), label: "signos animados a partir del diccionario DILSE" },
    { value: String(lessons), label: "lecciones cortas" },
    { value: `${levels[0]?.id}–${levels.at(-1)?.id}`, label: "niveles del Marco Común Europeo" },
  ];
}

export default function HomePage() {
  const facts = curriculumFacts();

  return (
    <div className="overflow-x-clip">
      <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2" aria-label="Panduro">
          <Logo />
          <span className="font-display text-2xl font-extrabold text-brand-600 dark:text-brand-400">Panduro</span>
        </Link>
        {!DEMO_MODE && (
          <nav className="flex items-center gap-2 sm:gap-4">
            <Link href="/login" className="font-display text-lg font-bold text-slate-600 hover:text-brand-600 dark:text-slate-300">
              Entrar
            </Link>
            <Link href="/register" className="btn-secondary btn-sm">
              Crear cuenta
            </Link>
          </nav>
        )}
      </header>

      <main>
        <section className="mx-auto grid max-w-6xl items-center gap-x-12 gap-y-16 px-4 pb-20 pt-8 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:pt-14">
          <div className="space-y-7">
            <p className="chip bg-petrol-50 text-petrol-700 dark:bg-petrol-950 dark:text-petrol-200">
              Lengua de Signos Española
            </p>
            <h1 className="text-5xl font-extrabold leading-[0.95] tracking-tight sm:text-6xl">
              Aprende a signar en <span className="text-brand-500">LSE</span>, unos minutos cada día.
            </h1>
            <p className="max-w-xl text-lg text-slate-600 dark:text-slate-300">
              Un avatar te enseña cada signo, practicas con ejercicios cortos y tu cámara te dice si lo
              has hecho bien. Sin prisas y a tu ritmo.
            </p>
            <div className="flex flex-wrap gap-3">
              {DEMO_MODE ? (
                <DemoStartButton />
              ) : (
                <>
                  <Link href="/register" className="btn-primary px-7 py-3 text-xl">
                    Empezar gratis
                  </Link>
                  <Link href="/login" className="btn-secondary px-7 py-3 text-xl">
                    Ya tengo cuenta
                  </Link>
                </>
              )}
            </div>
            {DEMO_MODE && (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                Modo demo: funciona sin cuenta y tu progreso se guarda en este navegador.
              </p>
            )}
          </div>
          <HeroStage signs={HERO_SIGNS} />
        </section>

        <section aria-label="El curso en cifras" className="border-y-2 border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <dl className="mx-auto grid max-w-6xl gap-6 px-4 py-8 sm:grid-cols-3 sm:px-6">
            {facts.map((f) => (
              <div key={f.label} className="flex flex-col-reverse justify-end gap-1">
                <dt className="text-slate-600 dark:text-slate-300">{f.label}</dt>
                <dd className="font-display text-5xl font-extrabold leading-none tabular-nums text-petrol-500">{f.value}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="mx-auto max-w-6xl space-y-10 px-4 py-20 sm:px-6">
          <div className="max-w-2xl space-y-3">
            <p className="eyebrow">Así es una lección</p>
            <h2 className="text-4xl font-extrabold leading-tight">Ver, practicar y signar.</h2>
          </div>
          <ol className="grid gap-5 md:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="card space-y-3 p-6">
                <div className="flex items-center gap-3">
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-press shadow-brand-700">
                    <Icon name={s.icon} size={24} />
                  </span>
                  <span className="font-display text-sm font-bold uppercase tracking-[0.08em] text-slate-400">
                    Paso {i + 1}
                  </span>
                </div>
                <h3 className="text-2xl font-extrabold">{s.title}</h3>
                <p className="text-slate-600 dark:text-slate-300">{s.text}</p>
              </li>
            ))}
          </ol>
        </section>
      </main>

      <footer className="border-t-2 border-slate-200 dark:border-slate-800">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-slate-500 dark:text-slate-400 sm:px-6">
          <p className="font-display text-base font-bold text-slate-700 dark:text-slate-200">Panduro · Aprende LSE jugando cada día</p>
          <p>
            Signos de referencia: <a className="underline underline-offset-2" href="https://fundacioncnse-dilse.org">DILSE</a>{" "}
            (Fundación CNSE), CC BY-NC-SA 3.0. Avatar: VRoid Project (CC0). Mano: WebXR Input Profiles (MIT).
          </p>
        </div>
      </footer>
    </div>
  );
}
