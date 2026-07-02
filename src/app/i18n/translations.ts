export type Locale = "ru" | "en";

export type TranslationKey =
  | "shell.brand"
  | "shell.projects"
  | "shell.editor"
  | "shell.discussion"
  | "state.track.empty"
  | "state.sidebar.empty"
  | "state.readOnly"
  | "modal.audioUpload"
  | "modal.audioFormats"
  | "modal.close";

export const translations: Record<Locale, Record<TranslationKey, string>> = {
  ru: {
    "shell.brand": "collabStudio Stage 4",
    "shell.projects": "Проекты",
    "shell.editor": "Редактор",
    "shell.discussion": "Обсуждение",
    "state.track.empty": "Выберите проект и трек для работы.",
    "state.sidebar.empty": "Выберите трек, чтобы открыть правки, чат, задачи и AI-рифмы.",
    "state.readOnly": "Режим только чтения",
    "modal.audioUpload": "Добавление аудио",
    "modal.audioFormats": "Поддерживаются форматы: mp3, wav, flac, ogg, aac, m4a, webm. Лимит 25 МБ.",
    "modal.close": "Закрыть",
  },
  en: {
    "shell.brand": "collabStudio Stage 4",
    "shell.projects": "Projects",
    "shell.editor": "Editor",
    "shell.discussion": "Discussion",
    "state.track.empty": "Select a project and track to continue.",
    "state.sidebar.empty": "Select a track to open reviews, chat, tasks and AI rhymes.",
    "state.readOnly": "Read-only mode",
    "modal.audioUpload": "Add audio",
    "modal.audioFormats": "Supported formats: mp3, wav, flac, ogg, aac, m4a, webm. Limit is 25 MB.",
    "modal.close": "Close",
  },
};
