"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";

const schema = z.object({
  displayName: z.string().min(2, "Escribe tu nombre").max(60),
  email: z.string().email("Email no válido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

export function RegisterForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);

    const parsed = schema.safeParse({ displayName, email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;

    const { data, error: authError } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${origin}/auth/callback?next=/dashboard`,
        data: { display_name: parsed.data.displayName },
      },
    });
    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    if (data.session) {
      router.replace("/dashboard");
      router.refresh();
    } else {
      setMessage(
        "Te hemos enviado un email para confirmar tu cuenta. Revisa tu bandeja.",
      );
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <label className="block space-y-1.5">
        <span className="font-display text-base font-bold">Nombre</span>
        <input
          type="text"
          autoComplete="name"
          required
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="input"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="font-display text-base font-bold">Email</span>
        <input
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
        />
      </label>
      <label className="block space-y-1.5">
        <span className="font-display text-base font-bold">Contraseña</span>
        <input
          type="password"
          autoComplete="new-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-describedby="password-hint"
          className="input"
        />
        <span id="password-hint" className="block text-sm text-slate-500 dark:text-slate-400">
          Mínimo 8 caracteres.
        </span>
      </label>

      {error && (
        <p className="rounded-2xl bg-ko-50 px-4 py-2.5 text-sm font-medium text-ko-700 dark:bg-ko-950 dark:text-ko-200" role="alert">
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-2xl bg-petrol-50 px-4 py-2.5 text-sm font-medium text-petrol-700 dark:bg-petrol-950 dark:text-petrol-200" role="status">
          {message}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full"
      >
        {loading ? "Creando cuenta…" : "Crear cuenta"}
      </button>
    </form>
  );
}
