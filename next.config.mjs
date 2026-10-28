import withPWAInit from "next-pwa";
import defaultCache from "next-pwa/cache.js";

const isDev = process.env.NODE_ENV === "development";

const withPWA = withPWAInit({
  dest: "public",
  disable: isDev,
  register: true,
  skipWaiting: true,
  // Las páginas a las que se llega navegando dentro de la app también se guardan, para
  // volver a ellas sin conexión; las que no se han visitado muestran /offline.
  cacheOnFrontEndNav: true,
  // Next no sirve este manifiesto del App Router, y un solo 404 hace fallar la instalación del
  // service worker entera (fallo conocido de next-pwa 5).
  buildExcludes: [/app-build-manifest\.json$/],
  fallbacks: { document: "/offline" },
  // El avatar, la mano y los modelos de reconocimiento están en public/ y se guardan al
  // instalar. Aquí, lo que se pide sobre la marcha; delante de las reglas de next-pwa, porque
  // gana la primera que coincide.
  runtimeCaching: [
    {
      urlPattern: /\/models\/.*\.task$/,
      handler: "CacheFirst",
      options: {
        cacheName: "mediapipe-models",
        expiration: { maxEntries: 2, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
    {
      // Las animaciones de los signos: cambian solo al desplegar.
      urlPattern: ({ url }) => self.origin === url.origin && url.pathname.startsWith("/api/clips/"),
      handler: "StaleWhileRevalidate",
      options: {
        cacheName: "sign-clips",
        expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 30 },
      },
    },
    {
      // Los vídeos del DILSE de /dev/revisar (solo en desarrollo): nunca a la caché.
      urlPattern: ({ url }) => self.origin === url.origin && url.pathname.startsWith("/api/dev/"),
      handler: "NetworkOnly",
      options: {},
    },
    ...defaultCache,
  ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            key: "Permissions-Policy",
            value: "camera=(self), microphone=(), geolocation=()",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default withPWA(nextConfig);
