import { prisma } from "../db";
import { getConfig } from "../config";

const config = getConfig();

function escapeHtml(unsafe: string) {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildMetaTags(title: string, description: string, url: string, imageUrl?: string) {
  const tags = [
    `<meta property="og:title" content="${escapeHtml(title)}" />`,
    `<meta property="og:description" content="${escapeHtml(description)}" />`,
    `<meta property="og:url" content="${escapeHtml(url)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta name="twitter:card" content="${imageUrl ? 'summary_large_image' : 'summary'}" />`,
    `<meta name="twitter:title" content="${escapeHtml(title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(description)}" />`,
  ];
  if (imageUrl) {
    tags.push(`<meta property="og:image" content="${escapeHtml(imageUrl)}" />`);
    tags.push(`<meta name="twitter:image" content="${escapeHtml(imageUrl)}" />`);
  }
  return tags.join("\n    ");
}

function buildJsonLd(data: object) {
  return `<script type="application/ld+json">\n${JSON.stringify(data, null, 2)}\n</script>`;
}

export async function getProfileMeta(handle: string): Promise<string | null> {
  const user = await prisma.user.findFirst({
    where: { username: { equals: handle, mode: "insensitive" }, isPublicProfile: true },
  });

  if (!user) return null;

  const title = `${user.displayName} (@${user.username}) | CollabStudio`;
  const description = user.bio || `Check out ${user.displayName}'s profile on CollabStudio.`;
  const url = `${config.APP_URL}/u/${user.username}`;
  const imageUrl = user.avatarUrl || `${config.APP_URL}/default-avatar.png`;

  const metaTags = buildMetaTags(title, description, url, imageUrl);

  const jsonLd = buildJsonLd({
    "@context": "https://schema.org",
    "@type": "Person",
    name: user.displayName,
    alternateName: user.username,
    url: url,
    image: imageUrl,
    description: user.bio || undefined,
  });

  return `${metaTags}\n    ${jsonLd}`;
}

export async function getPublicationMeta(slug: string, kind: "WORK" | "COLLAB"): Promise<string | null> {
  const publication = await prisma.publication.findUnique({
    where: { slug },
    include: {
      author: { select: { displayName: true, username: true } },
    },
  });

  if (!publication || publication.kind !== kind || publication.status !== "PUBLISHED") {
    return null;
  }

  const isCollab = kind === "COLLAB";
  const typeLabel = isCollab ? "Collaboration" : "Work";
  const title = `${publication.title} - ${publication.author.displayName} | CollabStudio`;
  const description = publication.description || `A new ${typeLabel.toLowerCase()} by ${publication.author.displayName}.`;
  const url = `${config.APP_URL}/${isCollab ? "collabs" : "works"}/${publication.slug}`;
  const imageUrl = publication.coverImageUrl || `${config.APP_URL}/default-cover.png`;

  const metaTags = buildMetaTags(title, description, url, imageUrl);

  const jsonLd = buildJsonLd({
    "@context": "https://schema.org",
    "@type": "MusicComposition",
    name: publication.title,
    description: publication.description || undefined,
    url: url,
    image: imageUrl,
    creator: {
      "@type": "Person",
      name: publication.author.displayName,
      url: `${config.APP_URL}/u/${publication.author.username}`,
    },
  });

  return `${metaTags}\n    ${jsonLd}`;
}
