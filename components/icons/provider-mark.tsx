type ProviderMarkProps = {
  providerId: string;
  color: string;
  size?: number;
};

export function ProviderMark({
  providerId,
  color,
  size = 24,
}: ProviderMarkProps) {
  if (providerId.startsWith("gemini")) {
    return (
      <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24">
        <defs>
          <linearGradient id="gemini-gradient" x1="2" y1="2" x2="22" y2="22">
            <stop stopColor="#4C78FF" />
            <stop offset="0.48" stopColor="#9B72F6" />
            <stop offset="1" stopColor="#F05A91" />
          </linearGradient>
        </defs>
        <path
          fill="url(#gemini-gradient)"
          d="M12 1.8c.74 5.8 4.4 9.46 10.2 10.2-5.8.74-9.46 4.4-10.2 10.2C11.26 16.4 7.6 12.74 1.8 12 7.6 11.26 11.26 7.6 12 1.8Z"
        />
      </svg>
    );
  }

  if (providerId.startsWith("claude")) {
    return (
      <svg
        aria-hidden="true"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2.1"
        strokeLinecap="round"
      >
        <path d="M12 2v20M2 12h20M4.9 4.9l14.2 14.2M19.1 4.9 4.9 19.1" />
        <path d="m7.2 2.8 9.6 18.4M21.2 7.2 2.8 16.8M16.8 2.8 7.2 21.2M21.2 16.8 2.8 7.2" />
      </svg>
    );
  }

  if (providerId.startsWith("grok")) {
    return (
      <svg
        aria-hidden="true"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
      >
        <circle cx="12" cy="12" r="8.5" />
        <path d="M17.8 4.9 8.7 14M6.2 19.1l4.2-4.2M14.4 9.6l3.4 3.4" />
      </svg>
    );
  }

  if (providerId.startsWith("chatgpt") || providerId.startsWith("openai")) {
    return (
      <svg
        aria-hidden="true"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke={color}
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M12 3.2a4.1 4.1 0 0 1 7 3 4.15 4.15 0 0 1 1.1 7.8 4.13 4.13 0 0 1-4.4 6.8 4.13 4.13 0 0 1-7.8-1.1 4.15 4.15 0 0 1-6.8-4.4A4.13 4.13 0 0 1 2.2 7.5 4.13 4.13 0 0 1 12 3.2Z" />
        <path d="m8.2 8.4 3.8-2.2 3.8 2.2v4.4L12 15l-3.8-2.2V8.4Z" />
        <path d="m12 6.2 3.8 6.6M15.8 8.4H8.2M8.2 12.8 12 6.2M8.2 8.4l7.6 4.4M12 15l-3.8-6.6" />
      </svg>
    );
  }

  const initial = providerId.includes("deepseek")
    ? "D"
    : providerId.includes("doubao")
      ? "豆"
      : providerId.includes("qwen")
        ? "Q"
        : providerId.includes("kimi")
          ? "K"
          : providerId.includes("hunyuan")
            ? "混"
            : providerId.includes("ernie")
              ? "文"
              : providerId.includes("glm")
                ? "智"
                : providerId.includes("minimax")
                  ? "M"
                  : providerId.includes("step")
                    ? "跃"
                    : providerId.includes("spark")
                      ? "星"
                      : "AI";

  return (
    <span
      aria-hidden="true"
      className="provider-initial"
      style={{ backgroundColor: color }}
    >
      {initial}
    </span>
  );
}
