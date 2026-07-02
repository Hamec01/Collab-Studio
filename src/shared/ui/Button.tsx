import React from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
};

const variantClass: Record<ButtonVariant, string> = {
  primary: "bg-indigo-600 hover:bg-indigo-500 text-white border border-indigo-500/40",
  secondary: "bg-neutral-800 hover:bg-neutral-700 text-neutral-100 border border-neutral-700",
  danger: "bg-red-800/80 hover:bg-red-700 text-red-100 border border-red-700/60",
  ghost: "bg-transparent hover:bg-neutral-800/70 text-neutral-200 border border-neutral-700/50",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "text-xs px-3 py-2 min-h-11",
  md: "text-sm px-4 py-2.5 min-h-11",
};

export default function Button({ variant = "primary", size = "sm", className = "", type = "button", ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed min-w-11 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400 ${variantClass[variant]} ${sizeClass[size]} ${className}`}
      {...rest}
    />
  );
}
