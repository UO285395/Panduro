import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <Link
        href="/"
        className="mb-8 text-lg font-bold text-brand-700 hover:underline"
      >
        ← Panduro
      </Link>
      {children}
    </main>
  );
}
