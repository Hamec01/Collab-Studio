export const FEATURE_FLAG_KEYS = ["internalDiagnostics", "lyricsStructuredEditor", "publicComments"] as const;

export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];
export type FeatureFlags = Record<FeatureFlagKey, boolean>;

export type PublicFeatureFlagEnv = {
  VITE_FEATURE_FLAGS?: string;
  VITE_FLAG_INTERNAL_DIAGNOSTICS?: string;
  VITE_FLAG_LYRICS_STRUCTURED_EDITOR?: string;
  VITE_FLAG_PUBLIC_COMMENTS?: string;
};

const TRUE_VALUES = new Set(["1", "true", "on", "yes", "enabled"]);

export const DEFAULT_FEATURE_FLAGS: FeatureFlags = {
  internalDiagnostics: false,
  lyricsStructuredEditor: false,
  publicComments: false,
};

function parseBoolean(raw: string | undefined): boolean | null {
  if (typeof raw !== "string") return null;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return null;
  return TRUE_VALUES.has(normalized);
}

function parseFlagList(raw: string | undefined): Partial<FeatureFlags> {
  if (typeof raw !== "string" || raw.trim() === "") return {};

  const parsed: Partial<FeatureFlags> = {};
  const tokens = raw.split(",").map((token) => token.trim()).filter(Boolean);

  for (const token of tokens) {
    const [rawKey, rawValue] = token.includes("=")
      ? token.split("=", 2)
      : [token, "true"];

    const key = rawKey.trim() as FeatureFlagKey;
    if (!FEATURE_FLAG_KEYS.includes(key)) continue;

    const shouldEnable = parseBoolean(rawValue);
    if (shouldEnable === null) continue;
    parsed[key] = shouldEnable;
  }

  return parsed;
}

export function resolveFeatureFlags(env: PublicFeatureFlagEnv): FeatureFlags {
  const flags: FeatureFlags = { ...DEFAULT_FEATURE_FLAGS };

  const fromList = parseFlagList(env.VITE_FEATURE_FLAGS);
  for (const key of FEATURE_FLAG_KEYS) {
    if (typeof fromList[key] === "boolean") {
      flags[key] = fromList[key];
    }
  }

  const diagnosticsOverride = parseBoolean(env.VITE_FLAG_INTERNAL_DIAGNOSTICS);
  if (diagnosticsOverride !== null) {
    flags.internalDiagnostics = diagnosticsOverride;
  }

  const lyricsStructuredEditorOverride = parseBoolean(env.VITE_FLAG_LYRICS_STRUCTURED_EDITOR);
  if (lyricsStructuredEditorOverride !== null) {
    flags.lyricsStructuredEditor = lyricsStructuredEditorOverride;
  }

  return flags;
}

const publicEnv =
  ((import.meta as ImportMeta & { env?: PublicFeatureFlagEnv }).env as PublicFeatureFlagEnv | undefined) ?? {};

export const featureFlags = resolveFeatureFlags(publicEnv);
