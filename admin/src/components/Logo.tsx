// Logo Axone, identique à celui du site : pastille turquoise, tiret, barre, puis « axone ».
export function Logo({ size = 24 }: { size?: number }) {
  return (
    <span className="ax-logo" style={{ fontSize: size }}>
      <svg width={size * 1.25} height={size * 1.25} viewBox="0 0 30 30" fill="none" aria-hidden>
        <circle cx="9" cy="15" r="6" fill="#07a997" />
        <path d="M15 15h12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
        <path d="M22 9v12" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
      </svg>
      axone
    </span>
  )
}
