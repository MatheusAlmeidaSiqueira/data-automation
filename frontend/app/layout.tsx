import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://matheus-analytics-guarulhos.matheusalmeidasiquei.chatgpt.site"),
  title: "WeatherFlow Analytics | Guarulhos",
  description: "Plataforma analítica de dados meteorológicos de Guarulhos desenvolvida por Matheus Almeida Siqueira.",
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    title: "WeatherFlow Analytics | Guarulhos",
    description: "Dados reais, previsão, histórico e qualidade meteorológica de Guarulhos em uma plataforma analítica.",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "WeatherFlow Analytics | Guarulhos",
    description: "Dados reais, previsão, histórico e qualidade meteorológica de Guarulhos.",
  },
  icons: { icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="pt-BR"><body>{children}</body></html>;
}
