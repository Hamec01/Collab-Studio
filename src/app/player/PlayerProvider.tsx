import React, { createContext, useCallback, useContext, useMemo, useState } from "react";
import type { PlayableAudioSource } from "../../types";

type PlayerContextValue = {
  selectedAudioSourceId: string | null;
  setSelectedAudioSourceId: React.Dispatch<React.SetStateAction<string | null>>;
  syncSelectedAudioSource: (audioSources: PlayableAudioSource[]) => void;
};

const PlayerContext = createContext<PlayerContextValue | undefined>(undefined);

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const [selectedAudioSourceId, setSelectedAudioSourceId] = useState<string | null>(null);

  const syncSelectedAudioSource = useCallback((audioSources: PlayableAudioSource[]) => {
    setSelectedAudioSourceId((prev) => {
      if (prev && audioSources.some((source) => source.id === prev)) {
        return prev;
      }
      return audioSources[0]?.id ?? null;
    });
  }, []);

  const value = useMemo(
    () => ({
      selectedAudioSourceId,
      setSelectedAudioSourceId,
      syncSelectedAudioSource,
    }),
    [selectedAudioSourceId, syncSelectedAudioSource],
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
