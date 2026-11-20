// Marca Hilvana AI: una "H" hecha de dos hilos unidos por una puntada naranja, con una chispa (la IA).
export function LogoMark({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="16" fill="#1B2340" />
      <path d="M20 16v32M44 16v32" stroke="#F3EDE0" strokeWidth="6" strokeLinecap="round" />
      <path d="M20 32h24" stroke="#E4572E" strokeWidth="4.5" strokeLinecap="round" strokeDasharray="0.1 8.5" />
      <circle cx="20" cy="32" r="3.4" fill="#E4572E" />
      <path d="M49 6.5l1.7 4.6 4.6 1.7-4.6 1.7L49 19.1l-1.7-4.6-4.6-1.7 4.6-1.7z" fill="#E4572E" />
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo-word">Hilvana<sup>AI</sup></span>
    </span>
  );
}
