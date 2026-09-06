/**
 * URL boundary shared by public snapshot ingestion and read-model serializers.
 * Public data may contain links, but it must never turn into a credential leak
 * or an obvious server-side request forgery target.
 */

export function isPrivateOrReservedHostname(hostname: string): boolean {
  const host = hostname
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host === "metadata.google.internal" ||
    host === "metadata.google" ||
    host === "169.254.169.254" ||
    host === "::1" ||
    host === "0:0:0:0:0:0:0:1"
  ) {
    return true;
  }

  const ipv6 = parseIpv6(host);
  if (ipv6) {
    const first = ipv6[0];
    // IPv4-mapped/compatible IPv6 can hide a private IPv4 address in either
    // dotted-decimal or hexadecimal form (for example ::ffff:7f00:1).
    const hasV4Prefix = ipv6.slice(0, 5).every((part) => part === 0);
    const isMapped = hasV4Prefix && ipv6[5] === 0xffff;
    const isCompatible = hasV4Prefix && ipv6[5] === 0;
    if (isMapped || isCompatible) {
      const mapped = `${ipv6[6] >> 8}.${ipv6[6] & 255}.${ipv6[7] >> 8}.${ipv6[7] & 255}`;
      return isPrivateOrReservedHostname(mapped);
    }

    // Common non-global IPv6 ranges: ULA, link-local, unspecified, multicast,
    // documentation/benchmark prefixes, and 6to4 addresses carrying a
    // private/reserved IPv4 destination.
    if (
      first === 0 ||
      (first & 0xfe00) === 0xfc00 ||
      (first & 0xffc0) === 0xfe80 ||
      (first & 0xff00) === 0xff00 ||
      (first === 0x2001 && ipv6[1] === 0x0db8) ||
      (first === 0x2001 && ipv6[1] === 0x0002) ||
      (first === 0x2001 && (ipv6[1] & 0xfff0) === 0x0010) ||
      first === 0x3fff
    ) {
      return true;
    }
    if (first === 0x2002) {
      const embedded = `${ipv6[1] >> 8}.${ipv6[1] & 255}.${ipv6[2] >> 8}.${ipv6[2] & 255}`;
      return isPrivateOrReservedHostname(embedded);
    }
    return false;
  }

  // IPv4 and IPv4-mapped IPv6 written with a dotted-decimal tail.
  const mapped = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i)?.[1];
  const ipv4 = mapped ?? host;
  const parts = ipv4.split(".").map(Number);
  if (
    parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
  ) {
    return (
      parts[0] === 0 ||
      parts[0] === 10 ||
      parts[0] === 127 ||
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 0 && parts[2] === 0) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 198 && parts[1] >= 18 && parts[1] <= 19) ||
      (parts[0] === 198 && parts[1] === 51 && parts[2] === 100) ||
      (parts[0] === 203 && parts[1] === 0 && parts[2] === 113) ||
      parts[0] >= 224
    );
  }

  if (host.includes(":")) {
    // fc00::/7 (ULA), fe80::/10 (link local), and unspecified/loopback.
    return (
      host === "::" ||
      host === "0:0:0:0:0:0:0:0" ||
      host.startsWith("fc") ||
      host.startsWith("fd") ||
      /^fe[89ab]/i.test(host)
    );
  }

  return false;
}

/** Parse a bracket-stripped IPv6 literal into eight 16-bit words. */
function parseIpv6(host: string): number[] | null {
  if (!host.includes(":")) return null;
  if (host.includes("%")) return null; // zone identifiers are not URL-safe.

  let value = host;
  let ipv4Words: number[] = [];
  if (value.includes(".")) {
    const separator = value.lastIndexOf(":");
    if (separator < 0) return null;
    const octets = value
      .slice(separator + 1)
      .split(".")
      .map(Number);
    if (
      octets.length !== 4 ||
      octets.some(
        (octet) => !Number.isInteger(octet) || octet < 0 || octet > 255,
      )
    ) {
      return null;
    }
    ipv4Words = [(octets[0] << 8) | octets[1], (octets[2] << 8) | octets[3]];
    value = value.slice(0, separator);
  }

  const halves = value.split("::");
  if (halves.length > 2) return null;
  const parseHalf = (half: string): number[] | null => {
    if (!half) return [];
    const parts = half.split(":");
    const words = parts.map((part) => {
      if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
      return Number.parseInt(part, 16);
    });
    return words.some((word) => word === null) ? null : (words as number[]);
  };
  const left = parseHalf(halves[0]);
  const right = parseHalf(halves[1] ?? "");
  if (!left || !right) return null;
  const explicit = [...left, ...right, ...ipv4Words];
  if (halves.length === 1) return explicit.length === 8 ? explicit : null;
  const zeroCount = 8 - explicit.length;
  if (zeroCount < 1) return null;
  return [
    ...left,
    ...Array.from({ length: zeroCount }, () => 0),
    ...right,
    ...ipv4Words,
  ];
}

export function parseSafePublicHttpUrl(value: unknown): URL | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    if (
      url.username ||
      url.password ||
      isPrivateOrReservedHostname(url.hostname)
    ) {
      return null;
    }
    // A public link must not publish signed URLs or browser fragment secrets.
    if (
      [...url.searchParams.keys()].some((key) =>
        /token|secret|password|passwd|authorization|credential|session|cookie|api[-_]?key|signature|bearer|^sig$/i.test(
          key,
        ),
      )
    )
      return null;
    url.hash = "";
    return url;
  } catch {
    return null;
  }
}

export function isSafePublicHttpUrl(value: unknown): value is string {
  return parseSafePublicHttpUrl(value) !== null;
}

export function safePublicHttpUrl(value: unknown): string | null {
  return parseSafePublicHttpUrl(value)?.toString() ?? null;
}
