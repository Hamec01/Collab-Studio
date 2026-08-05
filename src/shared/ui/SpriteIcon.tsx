import React from "react";

export type SpriteIconName =
  | "musicUpload"
  | "folderAdd"
  | "folders"
  | "chat"
  | "chats"
  | "undo"
  | "user"
  | "users"
  | "settings"
  | "doc"
  | "play"
  | "pause"
  | "wave"
  | "headphones"
  | "heart"
  | "star"
  | "search"
  | "share"
  | "menu"
  | "bell"
  | "calendar"
  | "download"
  | "cloudUpload"
  | "home"
  | "trash"
  | "pencil"
  | "pin"
  | "power"
  | "lock"
  | "wrench";

type SpriteCell = { col: number; row: number };

const GRID_COLS = 6;
const GRID_ROWS = 5;

const CELL_BY_NAME: Record<SpriteIconName, SpriteCell> = {
  musicUpload: { col: 0, row: 0 },
  folderAdd: { col: 1, row: 0 },
  folders: { col: 2, row: 0 },
  chat: { col: 3, row: 0 },
  chats: { col: 4, row: 0 },
  undo: { col: 5, row: 0 },
  user: { col: 0, row: 1 },
  users: { col: 1, row: 1 },
  settings: { col: 2, row: 1 },
  doc: { col: 3, row: 1 },
  play: { col: 4, row: 1 },
  pause: { col: 5, row: 1 },
  wave: { col: 0, row: 2 },
  headphones: { col: 1, row: 2 },
  heart: { col: 2, row: 2 },
  star: { col: 3, row: 2 },
  search: { col: 4, row: 2 },
  share: { col: 5, row: 2 },
  menu: { col: 0, row: 3 },
  bell: { col: 1, row: 3 },
  calendar: { col: 2, row: 3 },
  download: { col: 3, row: 3 },
  cloudUpload: { col: 4, row: 3 },
  home: { col: 5, row: 3 },
  trash: { col: 0, row: 4 },
  pencil: { col: 1, row: 4 },
  pin: { col: 2, row: 4 },
  power: { col: 3, row: 4 },
  lock: { col: 4, row: 4 },
  wrench: { col: 5, row: 4 },
};

type SpriteIconProps = {
  name: SpriteIconName;
  className?: string;
  size?: number;
  title?: string;
};

export default function SpriteIcon({ name, className = "", size = 20, title }: SpriteIconProps) {
  const { col, row } = CELL_BY_NAME[name];
  const x = GRID_COLS > 1 ? (col / (GRID_COLS - 1)) * 100 : 0;
  const y = GRID_ROWS > 1 ? (row / (GRID_ROWS - 1)) * 100 : 0;

  return (
    <span
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      className={className}
      style={{
        display: "inline-block",
        width: `${size}px`,
        height: `${size}px`,
        backgroundImage: "url('/icons/collab-sprite.png')",
        backgroundRepeat: "no-repeat",
        backgroundSize: `${GRID_COLS * 100}% ${GRID_ROWS * 100}%`,
        backgroundPosition: `${x}% ${y}%`,
      }}
    />
  );
}
