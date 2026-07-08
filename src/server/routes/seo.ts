import { Router, type Request, type Response } from "express";
import { prisma } from "../db";
import { getConfig } from "../config";

const router = Router();
const config = getConfig();

router.get("/robots.txt", (req: Request, res: Response) => {
  const robots = `User-agent: *
Disallow: /app/
Disallow: /api/
Allow: /
Sitemap: ${config.APP_URL}/sitemap.xml
`;
  res.type("text/plain");
  res.send(robots);
});

router.get("/sitemap.xml", async (req: Request, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      where: { isPublicProfile: true },
      select: { username: true, updatedAt: true },
    });

    const publications = await prisma.publication.findMany({
      where: { status: "PUBLISHED" },
      select: { slug: true, kind: true, updatedAt: true },
    });

    let xml = `<?xml version="1.0" encoding="UTF-8"?>\n`;
    xml += `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;

    // Add home page
    xml += `  <url>\n    <loc>${config.APP_URL}/</loc>\n    <changefreq>daily</changefreq>\n    <priority>1.0</priority>\n  </url>\n`;

    // Add public profiles
    for (const user of users) {
      xml += `  <url>\n    <loc>${config.APP_URL}/u/${user.username}</loc>\n    <lastmod>${user.updatedAt.toISOString()}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n`;
    }

    // Add publications
    for (const pub of publications) {
      const routePrefix = pub.kind === "COLLAB" ? "collabs" : "works";
      xml += `  <url>\n    <loc>${config.APP_URL}/${routePrefix}/${pub.slug}</loc>\n    <lastmod>${pub.updatedAt.toISOString()}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.9</priority>\n  </url>\n`;
    }

    xml += `</urlset>`;

    res.type("application/xml");
    res.send(xml);
  } catch (error) {
    res.status(500).send("Error generating sitemap");
  }
});

export default router;
