import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";

const VERSION = "v1";
const IV_BYTES = 12;

function encryptionKey(secret: string): Buffer {
  return createHmac("sha256", secret)
    .update("transit-submission-email-encryption-v1")
    .digest();
}

export function encryptTransitSubmissionEmail(
  email: string,
  secret: string,
): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  const ciphertext = Buffer.concat([
    cipher.update(email, "utf8"),
    cipher.final(),
  ]);
  return [
    VERSION,
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptTransitSubmissionEmail(
  value: string,
  secret: string,
): string {
  const [version, encodedIv, encodedTag, encodedCiphertext, extra] =
    value.split(".");
  if (
    version !== VERSION ||
    !encodedIv ||
    !encodedTag ||
    !encodedCiphertext ||
    extra
  ) {
    throw new Error("Invalid encrypted submission email");
  }
  const iv = Buffer.from(encodedIv, "base64url");
  if (iv.length !== IV_BYTES) {
    throw new Error("Invalid encrypted submission email");
  }
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), iv);
  decipher.setAuthTag(Buffer.from(encodedTag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encodedCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
