import { BRAND_ICONS } from "@/lib/brand-icons";
import type { AIProviderId, LanguageId } from "@/lib/types";

/** Official logo for a language or AI provider, in its brand color. Decorative by default. */
export default function BrandIcon({
  id,
  size = 16,
  className,
  label,
}: {
  id: LanguageId | AIProviderId;
  size?: number;
  className?: string;
  /** Accessible name; omit when the name is already shown as text next to it */
  label?: string;
}) {
  const icon = BRAND_ICONS[id];
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={icon.color}
      className={className ? `shrink-0 ${className}` : "shrink-0"}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <path d={icon.path} fillRule="evenodd" />
    </svg>
  );
}
