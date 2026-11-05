export function NftCover({
  variant = "primary",
  code,
}: {
  variant?: "primary" | "resale";
  code: string;
}) {
  return (
    <div className={`nft-cover nft-cover-${variant}`} aria-hidden="true">
      <div className="cover-top">
        <span>everkeep</span>
        <span>NEAR</span>
      </div>
      <svg viewBox="0 0 400 440" focusable="false">
        <g fill="none" stroke="currentColor" strokeWidth="1.1">
          <ellipse
            cx="200"
            cy="115"
            rx="49"
            ry="40"
            transform="rotate(-35 200 115)"
          />
          <ellipse
            cx="200"
            cy="115"
            rx="36"
            ry="28"
            transform="rotate(-35 200 115)"
          />
          <ellipse
            cx="200"
            cy="115"
            rx="23"
            ry="17"
            transform="rotate(-35 200 115)"
          />
        </g>
        <g fill="none" stroke="currentColor" strokeWidth=".7">
          {Array.from({ length: 36 }, (_, i) => {
            const y = 265 + i * 5;
            return (
              <path
                key={i}
                opacity={0.22 + i * 0.012}
                d={`M-45 ${y + 25} C60 ${y - 100} 105 ${y + 60} 220 ${y - 22} S365 ${y - 50} 455 ${y + 40}`}
              />
            );
          })}
        </g>
      </svg>
      <div className="cover-bottom">
        <span>
          Réserve.
          <br />À échéance.
        </span>
        <span>{code}</span>
      </div>
    </div>
  );
}
