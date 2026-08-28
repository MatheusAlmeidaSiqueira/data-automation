import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "WeatherFlow Analytics | Guarulhos",
  description: "Plataforma analítica de dados meteorológicos de Guarulhos desenvolvida por Matheus Almeida Siqueira.",
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
