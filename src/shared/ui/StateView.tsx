import React from "react";
import { AlertTriangle, Lock, LoaderCircle, SearchX } from "lucide-react";

type StateKind = "loading" | "empty" | "error" | "readOnly";

type StateViewProps = {
  kind: StateKind;
  message: string;
  className?: string;
  compact?: boolean;
};

const iconMap = {
  loading: LoaderCircle,
  empty: SearchX,
  error: AlertTriangle,
  readOnly: Lock,
} as const;

const toneMap = {
  loading: "text-neutral-400 border-neutral-800 bg-neutral-900/30",
  empty: "text-neutral-400 border-neutral-800 bg-neutral-900/20",
  error: "text-red-300 border-red-900/40 bg-red-950/40",
  readOnly: "text-amber-200 border-amber-800/50 bg-amber-950/30",
} as const;

export default function StateView({ kind, message, className = "", compact = false }: StateViewProps) {
  const Icon = iconMap[kind];
  return (
    <div className={`rounded-xl border ${toneMap[kind]} ${compact ? "p-2.5 text-xs" : "p-6 text-sm"} ${className}`} role={kind === "error" ? "alert" : "status"}>
      <div className="flex items-center gap-2">
        <Icon className={`${compact ? "w-4 h-4" : "w-5 h-5"} ${kind === "loading" ? "animate-spin" : ""}`} />
        <span>{message}</span>
      </div>
    </div>
  );
}
