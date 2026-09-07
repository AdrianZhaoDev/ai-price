const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect x="2" y="2" width="60" height="60" rx="18" fill="#0b1b33"/>
  <path d="M47.5 43.5A21 21 0 1 1 51 24" fill="none" stroke="#f6f5f2" stroke-width="4.5" stroke-linecap="round"/>
  <path d="M18.5 39V27.5M26.5 39v-7M34.5 39V26M42.5 36V20" fill="none" stroke="#3b82f6" stroke-width="5" stroke-linecap="round"/>
  <circle cx="31.5" cy="40" r="4.25" fill="#f6f5f2"/>
  <path d="m34 42 17 12-10.5-18.5Z" fill="#d59a3a"/>
</svg>`;

export function GET() {
  return new Response(favicon, {
    headers: {
      "Cache-Control": "public, max-age=86400",
      "Content-Type": "image/svg+xml; charset=utf-8",
    },
  });
}
