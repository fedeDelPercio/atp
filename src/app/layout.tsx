import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Toaster } from "react-hot-toast";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: "Agentic Testing Panel",
  description:
    "Panel para testear agentes de IA (orquestador + subagentes + evaluator).",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

// Script anti-flash: aplica el tema (dark/light) antes del primer paint,
// según la preferencia guardada o, si no hay, la del sistema.
const themeScript = `
try {
  var t = localStorage.getItem('atp.theme');
  if (t === 'dark' || (!t && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  }
} catch (e) {}
`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: el script de tema agrega la clase `dark` al
    // <html> antes de la hidratación; ese desajuste es intencional.
    <html lang="es" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={inter.className}>
        {children}
        <Toaster
          position="top-right"
          toastOptions={{
            style: { fontSize: "13px", borderRadius: "10px" },
          }}
        />
      </body>
    </html>
  );
}
