"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/client";

const schema = z.object({
  email: z.string().email("Email no válido"),
  password: z.string().min(8, "Mínimo 8 caracteres"),
});

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/dashboard";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = schema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
      return;
    }

    setLoading(true);
    const supabase = createClient();
    const { error: authError } = await supabase.auth.signInWithPassword(parsed.data);
    setLoading(false);

    if (authError) {
      setError(authError.message);
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function onGoogle() {
    const supabase = createClient();
    const origin =
      process.env.NEXT_PUBLIC_SITE_URL ?? window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}` },
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
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
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
        />
      </label>

      {error && (
        <p className="rounded-2xl bg-ko-50 px-4 py-2.5 text-sm font-medium text-ko-700 dark:bg-ko-950 dark:text-ko-200" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="btn-primary w-full"
      >
        {loading ? "Entrando…" : "Entrar"}
      </button>

      <div className="flex items-center gap-3 py-1 text-sm text-slate-400" aria-hidden>
        <span className="h-0.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-700" />o
        <span className="h-0.5 flex-1 rounded-full bg-slate-200 dark:bg-slate-700" />
      </div>

      <button
        type="button"
        onClick={onGoogle}
        className="btn-secondary w-full"
      >
        Continuar con Google
      </button>
    </form>
  );
}
