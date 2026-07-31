const favicon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="16" fill="#f6f5f2"/>
  <path d="M15 22h18l16 16-12 12-22-22z" fill="#0066cc"/>
  <circle cx="25" cy="27" r="4" fill="#f6f5f2"/>
  <path d="M34 16v32M24 32h20" stroke="#1d1d1f" stroke-width="4" stroke-linecap="round" opacity=".9"/>
</svg>`;

export function GET() {
  return new Response(favicon, {
    headers: {
      "Cache-Control": "public, max-age=86400",
      "Content-Type": "image/svg+xml; charset=utf-8",
    },
  });
}
