import React from "react";

type CoverImageProps = {
  src: string | null | undefined;
  title: string;
  className?: string;
};

function titleGlyph(title: string) {
  const normalized = title.trim();
  return normalized.length === 0 ? "♪" : normalized[0].toUpperCase();
}

export default function CoverImage({ src, title, className = "" }: CoverImageProps) {
  const [failed, setFailed] = React.useState(false);

  if (!src || failed) {
    return (
      <div className={`w-12 h-12 rounded-lg border border-neutral-700 bg-gradient-to-br from-indigo-700/60 via-neutral-800 to-neutral-900 text-indigo-100 flex items-center justify-center font-bold ${className}`} aria-label={title}>
        {titleGlyph(title)}
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={title}
      className={`w-12 h-12 rounded-lg object-cover border border-neutral-700 bg-neutral-900 ${className}`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
