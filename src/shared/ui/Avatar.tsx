import React from "react";

type AvatarProps = {
  src: string | null | undefined;
  name: string;
  size?: "sm" | "md";
  className?: string;
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
}

export default function Avatar({ src, name, size = "md", className = "" }: AvatarProps) {
  const [failed, setFailed] = React.useState(false);
  const sizeClass = size === "sm" ? "w-7 h-7 text-[10px]" : "w-9 h-9 text-xs";

  if (!src || failed) {
    return (
      <div className={`${sizeClass} rounded-full border border-neutral-700 bg-neutral-800 text-neutral-200 flex items-center justify-center font-semibold ${className}`} aria-label={name}>
        {initials(name)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={name}
      className={`${sizeClass} rounded-full object-cover border border-neutral-700 bg-neutral-900 ${className}`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
