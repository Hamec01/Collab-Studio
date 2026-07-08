import { Router } from "express";
import { z } from "zod";
import { searchPublications, serializePrivatePublication } from "../services/publications";
import type { Request, Response, NextFunction } from "express";

const router = Router();

const discoverQuerySchema = z.object({
  q: z.string().optional(),
  kind: z.enum(["WORK", "COLLAB"]).optional(),
  tags: z.string().optional(), // comma-separated
  isFeatured: z.string().optional().transform(v => v === "true" ? true : undefined),
  limit: z.coerce.number().min(1).max(50).optional(),
  offset: z.coerce.number().min(0).optional(),
});

router.get(
  "/",
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      console.log("HIT DISCOVER"); const query = discoverQuerySchema.parse(req.query);

      const tags = query.tags ? query.tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined;

      const { total, publications } = await searchPublications({
        query: query.q,
        kind: query.kind,
        isFeatured: query.isFeatured,
        tags,
        limit: query.limit,
        offset: query.offset,
      });

      const userLikes = new Set<string>();
      if (req.user) {
        // Fetch user likes to populate hasLiked
        const { prisma } = await import("../db");
        const likes = await prisma.publicationLike.findMany({
          where: { userId: req.user.id, publicationId: { in: publications.map((p) => p.id) } },
          select: { publicationId: true },
        });
        likes.forEach((l) => userLikes.add(l.publicationId));
      }

      res.json({
        total,
        publications: publications.map((p) => serializePrivatePublication(p, userLikes.has(p.id))),
      });
    } catch (err) {
      next(err);
    }
  }
);

export default router;
