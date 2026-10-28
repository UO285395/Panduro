import Link from "next/link";
import { Logo } from "@/components/ui/Logo";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-4 py-10 sm:px-6">
      <Link href="/" className="mb-8 flex items-center gap-2 self-center" aria-label="Panduro, inicio">
        <Logo size={44} />
        <span className="font-display text-3xl font-extrabold text-brand-600 dark:text-brand-400">Panduro</span>
      </Link>
      <div className="card p-6 sm:p-8">{children}</div>
    </main>
  );
}
