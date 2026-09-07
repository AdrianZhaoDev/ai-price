type BrandMarkProps = {
  className?: string;
};

export function BrandMark({ className = "brand-mark" }: BrandMarkProps) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      aria-hidden="true"
      focusable="false"
      data-brand-mark="signal-compass"
    >
      <rect x="2" y="2" width="60" height="60" rx="18" fill="#0b1b33" />
      <path
        d="M47.5 43.5A21 21 0 1 1 51 24"
        fill="none"
        stroke="#f6f5f2"
        strokeWidth="4.5"
        strokeLinecap="round"
      />
      <path
        d="M18.5 39V27.5M26.5 39v-7M34.5 39V26M42.5 36V20"
        fill="none"
        stroke="#3b82f6"
        strokeWidth="5"
        strokeLinecap="round"
      />
      <circle cx="31.5" cy="40" r="4.25" fill="#f6f5f2" />
      <path d="m34 42 17 12-10.5-18.5Z" fill="#d59a3a" />
    </svg>
  );
}
