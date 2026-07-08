import { Prisma } from "@prisma/client";
import { Router, type NextFunction, type Request, type Response } from "express";
import { prisma } from "../db";
import { requireAuth, optionalAuth } from "../middleware/auth";
import { AppError } from "../middleware/errors";
import { publicProfileParamsSchema, updateProfileSchema } from "../schemas/profile";
import { publicProfileSelect, safeUserSelect, serializePublicProfile, serializeUser } from "../services/users";
import { followUser, unfollowUser, getFollowsData } from "../services/follows";

const privateRouter = Router();
const publicRouter = Router();

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const asyncHandler = (handler: AsyncHandler) => (req: Request, res: Response, next: NextFunction) => {
  handler(req, res, next).catch(next);
};

privateRouter.get(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    res.json({ user: serializeUser(req.user) });
  }),
);

privateRouter.put(
  "/me",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");

    const input = updateProfileSchema.parse(req.body);

    try {
      const user = await prisma.user.update({
        where: { id: req.user.id },
        data: {
          displayName: input.displayName,
          isPublicProfile: input.isPublicProfile,
          bio: input.bio?.trim() ? input.bio.trim() : null,
          location: input.location?.trim() ? input.location.trim() : null,
          website: input.website?.trim() ? input.website.trim() : null,
        },
        select: safeUserSelect,
      });

      req.user = user;
      res.json({ user: serializeUser(user) });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        throw new AppError(409, "PROFILE_CONFLICT", "Profile update conflicts with an existing record");
      }
      throw error;
    }
  }),
);

publicRouter.get(
  "/users/:handle",
  optionalAuth,
  asyncHandler(async (req, res) => {
    const { handle } = publicProfileParamsSchema.parse(req.params);

    const user = await prisma.user.findFirst({
      where: {
        username: { equals: handle, mode: "insensitive" },
        deletedAt: null,
        isPublicProfile: true,
      },
      select: publicProfileSelect,
    });

    if (!user) {
      throw new AppError(404, "PUBLIC_PROFILE_NOT_FOUND", "Public profile not found");
    }

    const currentUserId = req.user?.id ?? null;
    const followsMeta = await getFollowsData(currentUserId, user.id);

    res.json({ profile: serializePublicProfile(user, followsMeta) });
  }),
);

privateRouter.post(
  "/users/:handle/follow",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    const { handle } = publicProfileParamsSchema.parse(req.params);

    await followUser(req.user.id, handle);
    res.json({ status: "ok" });
  }),
);

privateRouter.post(
  "/users/:handle/unfollow",
  requireAuth,
  asyncHandler(async (req, res) => {
    if (!req.user) throw new AppError(401, "UNAUTHENTICATED", "Authentication required");
    const { handle } = publicProfileParamsSchema.parse(req.params);

    await unfollowUser(req.user.id, handle);
    res.json({ status: "ok" });
  }),
);

export { privateRouter as profileRouter, publicRouter };
