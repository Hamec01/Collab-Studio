import path from "node:path";

export const STAGE3_SMOKE_PREFIX = "stage3-smoke";

export function hasStage3SmokeMarker(value: string | null | undefined) {
  return typeof value === "string" && value.startsWith(STAGE3_SMOKE_PREFIX);
}

export function assertStage3SmokeMarker(value: string | null | undefined, label: string) {
  if (!hasStage3SmokeMarker(value)) {
    throw new Error(`Refusing to operate on non-smoke ${label}`);
  }
}

export function assertSafeUploadFilePath(filePath: string, uploadsRoot: string) {
  const resolvedRoot = path.resolve(uploadsRoot);
  const resolvedFile = path.resolve(filePath);

  if (!resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)) {
    throw new Error("Refusing to remove file outside uploads root");
  }

  if (!resolvedFile.includes(STAGE3_SMOKE_PREFIX)) {
    throw new Error("Refusing to remove upload without stage3-smoke marker");
  }
}

export function makeStage3SmokeName(runId: string, suffix: string) {
  return `${STAGE3_SMOKE_PREFIX}-${runId}-${suffix}`;
}
