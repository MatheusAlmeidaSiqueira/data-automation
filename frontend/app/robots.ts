import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: "https://matheus-analytics-guarulhos.matheusalmeidasiquei.chatgpt.site/sitemap.xml",
  };
}
