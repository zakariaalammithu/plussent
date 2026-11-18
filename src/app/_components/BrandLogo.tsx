import Image from "next/image";

/**
 * PlusSent brand logo — the single place logos are rendered.
 *
 * Assets (official, unmodified):
 * - /brand/plussent-logo.png — full horizontal logo, 2172x724 (3:1), white
 *   background, so it is ALWAYS shown on a white rounded surface — never on a
 *   dark background directly, never stretched/cropped, no colour filters.
 * - /brand/plussent-icon.png — standalone circular icon, 1254x1254 (1:1),
 *   transparent background, safe on any surface.
 *
 * `full`  — header, auth pages, sidebar (where space allows), footer.
 * `icon`  — compact sidebar, mobile nav, loading/empty states, favicon use.
 */
export default function BrandLogo({
  variant = "full",
  height = 36,
  alt = "PlusSent",
  priority = false,
}: {
  variant?: "full" | "icon";
  height?: number;
  alt?: string;
  priority?: boolean;
}) {
  if (variant === "icon") {
    return (
      <Image
        src="/brand/plussent-icon.png"
        alt={alt}
        width={height}
        height={height}
        priority={priority}
        style={{ objectFit: "contain", display: "block", flexShrink: 0 }}
      />
    );
  }
  // Full logo: 3:1 aspect (2172x724). White tile keeps the white-background
  // asset readable in light AND dark mode without any filter or distortion.
  const width = Math.round(height * 3);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        background: "#ffffff",
        borderRadius: 10,
        padding: "4px 10px",
        lineHeight: 0,
        flexShrink: 0,
      }}
    >
      <Image
        src="/brand/plussent-logo.png"
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        style={{ objectFit: "contain", display: "block", height: "auto", maxWidth: "100%" }}
      />
    </span>
  );
}
