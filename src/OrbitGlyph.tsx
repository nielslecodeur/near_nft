import type { SVGProps } from "react";
export function OrbitGlyph(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <g stroke="currentColor" strokeWidth="1.4">
        <ellipse
          cx="32"
          cy="32"
          rx="25"
          ry="21"
          transform="rotate(-36 32 32)"
        />
        <ellipse
          cx="32"
          cy="32"
          rx="19"
          ry="15"
          transform="rotate(-36 32 32)"
        />
        <ellipse cx="32" cy="32" rx="12" ry="9" transform="rotate(-36 32 32)" />
      </g>
    </svg>
  );
}
