import { apiRequest } from "./client";
import type { RhymeResult } from "../types";

export function requestRhymes(payload: { word: string; language: string; context?: string }) {
  return apiRequest<RhymeResult>("/api/gemini/rhymes", {
    method: "POST",
    body: {
      word: payload.word,
      language: payload.language,
      context: payload.context ?? "",
    },
  });
}
