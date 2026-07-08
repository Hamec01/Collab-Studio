import { prisma } from "../db";
import { AppError } from "../middleware/errors";

export async function followUser(followerId: string, followingUsername: string): Promise<void> {
  const targetUser = await prisma.user.findFirst({
    where: {
      username: { equals: followingUsername, mode: "insensitive" },
      deletedAt: null,
      isPublicProfile: true,
    },
    select: { id: true },
  });

  if (!targetUser) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found or profile is private");
  }

  if (targetUser.id === followerId) {
    throw new AppError(400, "CANNOT_FOLLOW_SELF", "You cannot follow yourself");
  }

  try {
    await prisma.follow.upsert({
      where: {
        followerId_followingId: {
          followerId,
          followingId: targetUser.id,
        },
      },
      create: {
        followerId,
        followingId: targetUser.id,
      },
      update: {},
    });
  } catch (error) {
    // Ignore database unique constraint error if it races, but upsert should handle it
    throw error;
  }
}

export async function unfollowUser(followerId: string, followingUsername: string): Promise<void> {
  const targetUser = await prisma.user.findFirst({
    where: {
      username: { equals: followingUsername, mode: "insensitive" },
      deletedAt: null,
    },
    select: { id: true },
  });

  if (!targetUser) {
    throw new AppError(404, "USER_NOT_FOUND", "User not found");
  }

  try {
    await prisma.follow.delete({
      where: {
        followerId_followingId: {
          followerId,
          followingId: targetUser.id,
        },
      },
    });
  } catch (error: any) {
    // If not found, prisma throws P2025. Make it idempotent.
    if (error.code === "P2025") {
      return;
    }
    throw error;
  }
}

export async function getFollowsData(currentUserId: string | null, targetUserId: string) {
  const [followersCount, followingCount, followRecord] = await Promise.all([
    prisma.follow.count({ where: { followingId: targetUserId } }),
    prisma.follow.count({ where: { followerId: targetUserId } }),
    currentUserId
      ? prisma.follow.findUnique({
          where: {
            followerId_followingId: {
              followerId: currentUserId,
              followingId: targetUserId,
            },
          },
        })
      : null,
  ]);

  return {
    followersCount,
    followingCount,
    isFollowing: !!followRecord,
  };
}
