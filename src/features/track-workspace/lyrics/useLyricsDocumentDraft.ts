import { useRef, useState } from "react";
import type { Track } from "../../../types";
import {
  type LyricsDocument,
  legacyPlainTextToLyricsDocument,
  lyricsDocumentToPlainText,
  normalizeLyricsDocument,
} from "./lyricsDocument";

const EMPTY_DOCUMENT = legacyPlainTextToLyricsDocument("");

export function buildLyricsDraftWrite(
  structured: boolean,
  document: LyricsDocument,
  content: string,
  baseRevision: number,
  leaseToken: string,
) {
  return structured
    ? { document, baseRevision, leaseToken }
    : { content, baseRevision, leaseToken };
}

export function withLyricsDraftSnapshot(
  track: Track,
  lyrics: string,
  lyricsRevision: number,
  updatedAt: string,
  lyricsDocument?: LyricsDocument,
): Track {
  return {
    ...track,
    lyrics,
    lyricsPlainText: lyrics,
    lyricsDocument: lyricsDocument ?? track.lyricsDocument,
    lyricsRevision,
    updatedAt,
  };
}

export function useLyricsDocumentDraft() {
  const [document, setDocumentState] = useState<LyricsDocument>(EMPTY_DOCUMENT);
  const documentRef = useRef<LyricsDocument>(EMPTY_DOCUMENT);

  const setDocument = (next: LyricsDocument) => {
    const normalized = normalizeLyricsDocument(next);
    documentRef.current = normalized;
    setDocumentState(normalized);
    return normalized;
  };

  const setPlainText = (plainText: string) => setDocument(legacyPlainTextToLyricsDocument(plainText));

  const loadTrack = (track: Pick<Track, "lyrics" | "lyricsDocument">) =>
    setDocument(track.lyricsDocument ?? legacyPlainTextToLyricsDocument(track.lyrics));

  const loadLocal = (draft: { content: string; document?: LyricsDocument }) =>
    setDocument(draft.document ?? legacyPlainTextToLyricsDocument(draft.content));

  const forPlainText = (plainText: string) => {
    const current = documentRef.current;
    return lyricsDocumentToPlainText(current) === plainText
      ? current
      : legacyPlainTextToLyricsDocument(plainText);
  };

  const reset = () => setDocument(EMPTY_DOCUMENT);

  return { document, documentRef, setDocument, setPlainText, loadTrack, loadLocal, forPlainText, reset };
}
