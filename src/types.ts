export interface User {
  id: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
  role: 'admin' | 'user';
}

export interface Participant {
  userId: string;
  username: string;
  displayName: string;
  role: 'owner' | 'editor' | 'viewer';
}

export interface TrackVersion {
  id: string;
  lyrics: string;
  author: string;
  timestamp: string;
  label: string; // e.g. "Draft v1", "After Producer's feedback"
  isOriginal?: boolean;
}

export interface AudioVersion {
  id: string;
  filename: string;
  size?: string; // in MB or human readable
  url: string; // can be a local upload URL or a Google/Yandex/TG link
  isExternal: boolean;
  externalProvider?: 'google' | 'yandex' | 'telegram' | 'other';
  uploadedBy: string;
  timestamp: string;
  versionNumber: number;
}

export interface Comment {
  id: string;
  lineIndex?: number; // if connected to a specific lyrics line, 0-indexed
  author: string;
  text: string;
  timestamp: string;
  resolved: boolean;
}

export interface ChatMessage {
  id: string;
  author: string;
  text: string;
  timestamp: string;
}

export interface Task {
  id: string;
  title: string;
  status: 'todo' | 'in-progress' | 'done';
  assignedTo?: string; // displayName or username
  timestamp: string;
}

export interface AudioAnnotation {
  id: string;
  timestampSeconds: number;
  text: string;
  author: string;
  createdAt: string;
}

export interface Track {
  id: string;
  title: string;
  lyrics: string;
  tags: string[];
  versionHistory: TrackVersion[];
  audioVersions: AudioVersion[];
  comments: Comment[];
  chat: ChatMessage[];
  tasks: Task[];
  annotations: AudioAnnotation[];
}

export interface Project {
  id: string;
  title: string;
  type: 'single' | 'album';
  coverUrl: string;
  tags: string[];
  participants: Participant[];
  tracks: Track[];
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  projectId: string;
  projectName: string;
  trackId?: string;
  trackName?: string;
  message: string;
  author: string;
  timestamp: string;
  read: boolean;
}

export interface RhymeResult {
  word: string;
  rhymes: string[];
  suggestions?: string[];
}
