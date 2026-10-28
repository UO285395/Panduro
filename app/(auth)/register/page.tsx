import Link from "next/link";
import { RegisterForm } from "./register-form";

export const metadata = { title: "Crear cuenta" };

export default function RegisterPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-extrabold">Crear cuenta</h1>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Gratis para siempre. Empieza por el nivel A1 del currículo oficial de LSE.
      </p>
      <RegisterForm />
      <p className="text-sm text-slate-600 dark:text-slate-400">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-semibold text-brand-600 hover:underline dark:text-brand-400">
          Entra
        </Link>
        .
      </p>
    </div>
  );
}
