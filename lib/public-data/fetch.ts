import { lookup } from "node:dns/promises";
import { Agent, fetch } from "undici";
import { isPrivateOrReservedHostname } from "./urls";

export const MAX_SNAPSHOT_BYTES = 10 * 1024 * 1024;

/** Enforce the cap while reading, not after buffering an unbounded response. */
export async function readBoundedJson(
  body: AsyncIterable<Uint8Array>,
  maximum = MAX_SNAPSHOT_BYTES,
): Promise<unknown> {
  let size = 0;
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) {
    size += chunk.byteLength;
    if (size > maximum)
      throw new Error("Snapshot exceeds the response size limit.");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function fetchPublicSnapshot(url: URL): Promise<unknown> {
  const addresses = await lookup(url.hostname.replace(/^\[|\]$/g, ""), {
    all: true,
    verbatim: true,
  });
  if (
    !addresses.length ||
    addresses.some(({ address }) => isPrivateOrReservedHostname(address))
  ) {
    throw new Error("Snapshot host must resolve only to public addresses.");
  }
  const selected = addresses[0];
  // Connect to the validated address, retaining the original Host and TLS
  // server name. A second DNS lookup must not permit DNS rebinding.
  const dispatcher = new Agent({
    connect: {
      autoSelectFamily: false,
      lookup: (_hostname, _options, callback) =>
        callback(null, selected.address, selected.family),
    },
  });
  try {
    const response = await fetch(url, {
      dispatcher,
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: { accept: "application/json" },
    });
    try {
      if (!response.ok || !response.body)
        throw new Error("Snapshot request failed.");
      if (
        Number(response.headers.get("content-length") ?? 0) > MAX_SNAPSHOT_BYTES
      ) {
        throw new Error("Snapshot exceeds the response size limit.");
      }
      return await readBoundedJson(response.body);
    } finally {
      if (response.body && !response.body.locked) await response.body.cancel();
    }
  } finally {
    await dispatcher.destroy();
  }
}
