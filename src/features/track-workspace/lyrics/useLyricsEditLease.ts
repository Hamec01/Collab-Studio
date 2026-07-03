import { useCallback, useEffect, useRef, useState } from "react";
import { isApiError } from "../../../api/client";
import {
  acquireLyricsLease,
  heartbeatLyricsLease,
  releaseLyricsLease,
} from "../../../api/projects";

export type LyricsEditState = "reading" | "acquiring" | "editing" | "locked" | "lost";

type UseLyricsEditLeaseArgs = {
  projectId: string | null;
  trackId: string | null;
  canEdit: boolean;
  withAuth: <T>(operation: () => Promise<T>) => Promise<T>;
};

export function useLyricsEditLease({ projectId, trackId, canEdit, withAuth }: UseLyricsEditLeaseArgs) {
  const [editState, setEditState] = useState<LyricsEditState>("reading");
  const [leaseToken, setLeaseToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const heartbeatIntervalRef = useRef(30_000);
  const scopeRef = useRef({ projectId, trackId });
  const tokenRef = useRef<string | null>(null);

  const clearLease = useCallback((nextState: LyricsEditState) => {
    tokenRef.current = null;
    setLeaseToken(null);
    setExpiresAt(null);
    setEditState(nextState);
  }, []);

  const release = useCallback(async () => {
    const token = tokenRef.current;
    const scope = scopeRef.current;
    clearLease("reading");
    if (!token || !scope.projectId || !scope.trackId) return;
    const { projectId: leaseProjectId, trackId: leaseTrackId } = scope;
    await withAuth(() => releaseLyricsLease(leaseProjectId, leaseTrackId, token)).catch(() => undefined);
  }, [clearLease, withAuth]);

  const requestEdit = useCallback(async () => {
    if (!canEdit || !projectId || !trackId || editState === "acquiring") return false;
    if (editState === "editing") return true;
    setEditState("acquiring");
    try {
      const lease = await withAuth(() => acquireLyricsLease(projectId, trackId));
      tokenRef.current = lease.leaseToken;
      heartbeatIntervalRef.current = lease.heartbeatIntervalMs;
      setLeaseToken(lease.leaseToken);
      setExpiresAt(lease.expiresAt);
      setEditState("editing");
      return true;
    } catch (error) {
      clearLease(isApiError(error) && error.code === "LYRICS_LEASE_HELD" ? "locked" : "lost");
      return false;
    }
  }, [canEdit, clearLease, editState, projectId, trackId, withAuth]);

  const markLost = useCallback(() => clearLease("lost"), [clearLease]);

  useEffect(() => {
    if (editState !== "editing" || !leaseToken || !projectId || !trackId) return;
    const interval = window.setInterval(() => {
      void withAuth(() => heartbeatLyricsLease(projectId, trackId, leaseToken))
        .then((response) => setExpiresAt(response.expiresAt))
        .catch(() => markLost());
    }, heartbeatIntervalRef.current);
    return () => window.clearInterval(interval);
  }, [editState, leaseToken, markLost, projectId, trackId, withAuth]);

  useEffect(() => {
    if (!canEdit && tokenRef.current) {
      void release();
    }
  }, [canEdit, release]);

  useEffect(() => {
    return () => {
      const token = tokenRef.current;
      const scope = scopeRef.current;
      if (!token || !scope.projectId || !scope.trackId) return;
      void releaseLyricsLease(scope.projectId, scope.trackId, token).catch(() => undefined);
    };
  }, []);

  useEffect(() => {
    const previousScope = scopeRef.current;
    const previousToken = tokenRef.current;
    if (previousToken && previousScope.projectId && previousScope.trackId) {
      void releaseLyricsLease(previousScope.projectId, previousScope.trackId, previousToken).catch(() => undefined);
    }
    scopeRef.current = { projectId, trackId };
    clearLease("reading");
  }, [clearLease, projectId, trackId]);

  return {
    editState,
    isEditing: editState === "editing",
    leaseToken,
    expiresAt,
    requestEdit,
    release,
    markLost,
  };
}
