export type Locale = "ru" | "en";

export type TranslationKey =
  | "shell.brand"
  | "shell.projects"
  | "shell.editor"
  | "shell.discussion"
  | "state.track.empty"
  | "state.sidebar.empty"
  | "state.readOnly"
  | "lyrics.edit.acquiring"
  | "lyrics.lease.locked"
  | "lyrics.lease.lost"
  | "lyrics.comments.dialog"
  | "lyrics.comments.close"
  | "lyrics.player.label"
  | "lyrics.player.empty"
  | "lyrics.player.available"
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
    "lyrics.edit.acquiring": "Получение доступа...",
    "lyrics.lease.locked": "Текст уже редактируется в другом окне",
    "lyrics.lease.lost": "Сеанс редактирования завершён; локальный черновик сохранён",
    "lyrics.comments.dialog": "Контекстные комментарии к тексту",
    "lyrics.comments.close": "Закрыть комментарии",
    "lyrics.player.label": "Постоянный плеер",
    "lyrics.player.empty": "Аудио пока не прикреплено",
    "lyrics.player.available": "Плеер доступен",
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
    "lyrics.edit.acquiring": "Acquiring edit access...",
    "lyrics.lease.locked": "Lyrics are being edited in another window",
    "lyrics.lease.lost": "The edit session ended; the draft is saved locally",
    "lyrics.comments.dialog": "Contextual lyrics comments",
    "lyrics.comments.close": "Close comments",
    "lyrics.player.label": "Persistent player",
    "lyrics.player.empty": "No audio attached yet",
    "lyrics.player.available": "Player available",
    "state.readOnly": "Read-only mode",
    "modal.audioUpload": "Add audio",
    "modal.audioFormats": "Supported formats: mp3, wav, flac, ogg, aac, m4a, webm. Limit is 25 MB.",
    "modal.close": "Close",
  },
};
