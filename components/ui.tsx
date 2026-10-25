import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";

/** Join class names, skipping falsy values. */
export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "ghost" | "subtle";
  size?: "sm" | "md" | "lg";
};

export function Button({
  variant = "primary",
  size = "md",
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 font-semibold transition-all duration-150 select-none",
        "disabled:pointer-events-none disabled:opacity-40",
        size === "lg" && "h-11 rounded-lg px-6 text-[15px]",
        size === "md" && "h-10 rounded-lg px-5 text-[14px]",
        size === "sm" && "h-8 rounded-md px-3.5 text-[13.5px]",
        variant === "primary" &&
          "bg-accent text-[#0a0a0a] hover:bg-white active:scale-[0.98]",
        variant === "ghost" &&
          "border border-line bg-transparent text-ink-dim hover:border-line-strong hover:text-ink",
        variant === "subtle" && "text-ink-dim hover:bg-elevated hover:text-ink",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  children: ReactNode;
};

/** Small square icon button used in editor toolbars. */
export function IconButton({ label, className, children, ...props }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex h-7 w-7 items-center justify-center rounded-md text-ink-mute",
        "transition-colors duration-150 hover:bg-elevated hover:text-ink",
        "disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <Loader2
      size={size}
      className="animate-spin text-ink-dim"
      aria-hidden="true"
    />
  );
}
