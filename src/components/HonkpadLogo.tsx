export function HonkpadLogo({ className = '' }: { className?: string }) {
  return (
    <svg
      width="280"
      height="48"
      viewBox="0 0 280 48"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* icon */}
      <rect x="0" y="0" width="48" height="48" rx="12" fill="#7c3aed" />
      <rect x="9" y="13" width="7" height="22" rx="3.5" fill="white" opacity="0.85" />
      <rect x="20" y="7" width="7" height="34" rx="3.5" fill="white" />
      <rect x="31" y="13" width="7" height="22" rx="3.5" fill="white" opacity="0.85" />
      <path
        d="M20 9 Q27.5 2 35 9"
        fill="none"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
        opacity="0.8"
      />

      {/* wordmark */}
      <text
        x="62"
        y="33"
        fontFamily="system-ui, -apple-system, 'Segoe UI', sans-serif"
        fontSize="26"
        fontWeight="700"
        letterSpacing="-0.5"
        fill="white"
      >
        honk<tspan fill="#9f67f5">pad</tspan>
      </text>
    </svg>
  )
}
