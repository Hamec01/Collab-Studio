import { describe, expect, it } from "vitest";
import type { LyricsDocument } from "../features/track-workspace/lyrics/lyricsDocument";
import { createProjectWorkspace } from "../server/services/projectCreation";

type DbProject = {
  id: string;
  title: string;
  type: "single" | "album";
  coverUrl: string | null;
  tags: string[];
  members: Array<{ userId: string; role: "owner" }>;
  tracks: Array<{
    id: string;
    projectId: string;
    title: string;
    lyrics: string;
    lyricsDocument: LyricsDocument;
    lyricsPlainText: string;
    lyricsRevision: number;
    tags: string[];
  }>;
  createdAt: Date;
  updatedAt: Date;
};

function buildFakePrisma(options: { failTrackCreate?: boolean } = {}) {
  const state = {
    projects: [] as DbProject[],
  };

  const prisma = {
    $transaction: async (callback: (tx: any) => Promise<any>) => {
      const draft = structuredClone(state);
      const now = new Date("2026-07-04T12:00:00.000Z");
      let projectCounter = draft.projects.length;
      let trackCounter = draft.projects.flatMap((project) => project.tracks).length;

      const tx = {
        project: {
          create: async ({ data }: any) => {
            projectCounter += 1;
            const project: DbProject = {
              id: `project-${projectCounter}`,
              title: data.title,
              type: data.type,
              coverUrl: data.coverUrl ?? null,
              tags: data.tags ?? [],
              members: [{ userId: data.members.create.userId, role: "owner" }],
              tracks: [],
              createdAt: now,
              updatedAt: now,
            };
            draft.projects.push(project);
            return project;
          },
          findUniqueOrThrow: async ({ where }: any) => {
            const project = draft.projects.find((entry) => entry.id === where.id);
            if (!project) throw new Error("Project not found");
            return project;
          },
        },
        track: {
          create: async ({ data }: any) => {
            if (options.failTrackCreate) throw new Error("track create failed");
            const project = draft.projects.find((entry) => entry.id === data.projectId);
            if (!project) throw new Error("Project not found");
            trackCounter += 1;
            const track = {
              id: `track-${trackCounter}`,
              projectId: data.projectId,
              title: data.title,
              lyrics: data.lyrics,
              lyricsDocument: data.lyricsDocument,
              lyricsPlainText: data.lyricsPlainText,
              lyricsRevision: data.lyricsRevision ?? 0,
              tags: data.tags ?? [],
            };
            project.tracks.push(track);
            project.updatedAt = now;
            return track;
          },
        },
      };

      const result = await callback(tx);
      state.projects = draft.projects;
      return result;
    },
  };

  return { prisma: prisma as any, state };
}

describe("projectCreation", () => {
  it("creates single project and initial track atomically with structured lyrics compatibility fields", async () => {
    const { prisma } = buildFakePrisma();
    const include = { members: true, tracks: true } as const;

    const project = await createProjectWorkspace(prisma, {
      title: "Single",
      type: "single",
      initialTrackTitle: "Main Track",
      tags: ["pop"],
    }, { id: "user-1" }, include);

    expect(project.tracks).toHaveLength(1);
    expect(project.tracks[0].title).toBe("Main Track");
    expect(project.tracks[0].lyrics).toBe("");
    expect(project.tracks[0].lyricsPlainText).toBe("");
    expect(project.tracks[0].lyricsRevision).toBe(0);
    expect((project.tracks[0].lyricsDocument as LyricsDocument).schemaVersion).toBe(1);
    expect(project.members).toEqual([{ userId: "user-1", role: "owner" }]);
  });

  it("rolls back the whole single project when initial track creation fails", async () => {
    const { prisma, state } = buildFakePrisma({ failTrackCreate: true });
    const include = { members: true, tracks: true } as const;

    await expect(createProjectWorkspace(prisma, {
      title: "Broken Single",
      type: "single",
      initialTrackTitle: "Main Track",
    }, { id: "user-1" }, include)).rejects.toThrow(/track create failed/);

    expect(state.projects).toHaveLength(0);
  });

  it("allows albums to be created empty", async () => {
    const { prisma } = buildFakePrisma();
    const include = { members: true, tracks: true } as const;

    const project = await createProjectWorkspace(prisma, {
      title: "Album",
      type: "album",
    }, { id: "user-1" }, include);

    expect(project.tracks).toEqual([]);
    expect(project.type).toBe("album");
  });
});
