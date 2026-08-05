import React from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClass: Record<ButtonVariant, string> = {
  primary: "bg-[var(--cs-accent)] hover:bg-[var(--cs-accent-hover)] active:bg-[var(--cs-accent-active)] text-white border border-[var(--cs-accent-border)] shadow-[0_8px_24px_rgba(99,102,241,0.18)]",
  secondary: "bg-[var(--cs-bg-surface)] hover:bg-[var(--cs-bg-surface-hover)] active:bg-[var(--cs-bg-surface-active)] text-[var(--cs-text-primary)] border border-[var(--cs-border-default)]",
  danger: "bg-[var(--cs-error-soft)] hover:bg-red-500/20 text-red-200 border border-red-500/35",
  ghost: "bg-transparent hover:bg-[var(--cs-bg-surface-hover)] active:bg-[var(--cs-bg-surface-active)] text-[var(--cs-text-secondary)] border border-transparent hover:border-[var(--cs-border-default)]",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "text-xs px-3 py-2 min-h-11",
  md: "text-sm px-4 py-2.5 min-h-11",
};

export default function Button({ variant = "primary", size = "sm", className = "", type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-[background-color,border-color,color,box-shadow,transform] cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed min-w-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cs-focus-ring)] ${variantClass[variant]} ${sizeClass[size]} ${className}`}
      {...rest}
    />
  );
}
