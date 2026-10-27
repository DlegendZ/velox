/**
 * Invite codes: JSON → deflate → base64url with a version prefix, short enough to paste into any chat app.
 */
export const CODE_PREFIX = "VLX1-";
const toBase64Url = (bytes: Uint8Array) => {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const fromBase64Url = (text: string) => {
  const b64 = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(b64 + "===".slice((b64.length + 3) % 4));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
};
async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream) {
  const out = new Response(
    new Blob([bytes as BlobPart]).stream().pipeThrough(stream),
  );
  return new Uint8Array(await out.arrayBuffer());
}
export async function packCode(value: unknown) {
  const json = new TextEncoder().encode(JSON.stringify(value));
  return CODE_PREFIX + toBase64Url(await pipe(json, new CompressionStream("deflate-raw")));
}
export async function unpackCode<T = unknown>(code: string): Promise<T> {
  const clean = code.replace(/\s+/g, "");
  if (!clean.startsWith(CODE_PREFIX)) throw new Error("Not a VELOX code.");
  const body = clean.slice(CODE_PREFIX.length);
  if (!/^[A-Za-z0-9_-]+$/.test(body) || body.length > 20000)
    throw new Error("The code is damaged. Copy it again in full.");
  const bytes = await pipe(fromBase64Url(body), new DecompressionStream("deflate-raw"));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}
