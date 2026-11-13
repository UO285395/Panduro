import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ESTILO_SCRIPT } from "@/lib/ui/estilo";
import { Providers } from "./providers";

export const metadata: Metadata = {
  title: {
    default: "Panduro — aprende LSE",
    template: "%s · Panduro",
  },
  description:
    "Aprende Lengua de Signos Española de forma gamificada, con feedback por cámara y validación de la comunidad sorda.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icons/icon.svg",
    apple: "/icons/icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#fff3e6",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: ESTILO_SCRIPT }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
