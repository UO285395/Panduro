"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";

export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  // next-pwa solo inyecta el registro del service worker en las páginas de `pages/`, no en
  // las de `app/`: sin esto la app no se instalaba ni funcionaba sin conexión. En desarrollo
  // no hay sw.js (next.config: disable en desarrollo).
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
