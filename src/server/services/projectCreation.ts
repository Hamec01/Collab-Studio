import { Prisma, type PrismaClient, type User } from "@prisma/client";
import { prepareLyricsWrite, structuredTrackWriteData } from "./structuredLyrics";

function emptyTrackWriteData() {
  return structuredTrackWriteData(prepareLyricsWrite({ content: "", baseRevision: 0, leaseToken: "" }));
}

export type CreateProjectInput = {
  title: string;
  type: "single" | "album";
  coverUrl?: string | null;
  tags?: string[];
  initialTrackTitle?: string;
};

export async function createProjectWorkspace<TInclude extends Prisma.ProjectInclude>(
  prisma: PrismaClient,
  input: CreateProjectInput,
  user: Pick<User, "id">,
  include: TInclude,
): Promise<Prisma.ProjectGetPayload<{ include: TInclude }>> {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.create({
      data: {
        title: input.title,
        type: input.type,
        coverUrl: input.coverUrl ?? null,
        tags: input.tags ?? [],
        members: {
          create: {
            userId: user.id,
            role: "owner",
          },
        },
      },
    });

    if (input.type === "single") {
      await tx.track.create({
        data: {
          projectId: project.id,
          title: input.initialTrackTitle!,
          ...emptyTrackWriteData(),
          tags: [],
        },
      });
    }

    return tx.project.findUniqueOrThrow({
      where: { id: project.id },
      include,
    });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}
