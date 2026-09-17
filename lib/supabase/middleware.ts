import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { DEMO_MODE } from "@/lib/storage/flags";

type CookieToSet = { name: string; value: string; options: CookieOptions };

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/dev",
  "/lesson",
  "/review",
  "/onboarding",
  "/translate",
];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // En modo demo dejamos pasar todas las rutas: la persistencia y el "estar
  // dentro" se resuelven en cliente vía localStorage.
  if (DEMO_MODE) return supabaseResponse;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sin credenciales, no redirigimos ni fallamos: dejamos pasar en desarrollo.
  if (!url || !key) return supabaseResponse;

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED_PREFIXES.some((p) => path.startsWith(p));

  if (isProtected && !user) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", path);
    return NextResponse.redirect(loginUrl);
  }

  return supabaseResponse;
}
