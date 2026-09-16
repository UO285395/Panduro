import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "./login-form";

export const metadata = { title: "Entrar" };

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Entrar</h1>
      <Suspense fallback={<div className="h-40" aria-hidden />}>
        <LoginForm />
      </Suspense>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        ¿No tienes cuenta?{" "}
        <Link href="/register" className="text-brand-600 hover:underline">
          Crea una gratis
        </Link>
        .
      </p>
    </div>
  );
}
