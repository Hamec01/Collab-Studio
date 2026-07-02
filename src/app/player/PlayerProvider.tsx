import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { AudioVersion } from "../../types";

type PlayerContextValue = {
  selectedAudioVersionId: string | null;
  setSelectedAudioVersionId: React.Dispatch<React.SetStateAction<string | null>>;
  syncSelectedAudioVersion: (audioVersions: AudioVersion[]) => void;
};

const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [selectedAudioVersionId, setSelectedAudioVersionId] = useState<string | null>(null);

  const syncSelectedAudioVersion = useCallback((audioVersions: AudioVersion[]) => {
    setSelectedAudioVersionId((prev) => {
      if (prev && audioVersions.some((version) => version.id === prev)) {
        return prev;
      }
      return audioVersions[0]?.id ?? null;
    });
  }, []);

  const value = useMemo(
    () => ({
      selectedAudioVersionId,
      setSelectedAudioVersionId,
      syncSelectedAudioVersion,
    }),
    [selectedAudioVersionId, syncSelectedAudioVersion],
  );

  return <PlayerContext.Provider value={value}>{children}</PlayerContext.Provider>;
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error("usePlayer must be used within PlayerProvider");
  }
  return context;
}
