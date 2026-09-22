/** Exact body bytes from a Node Buffer (avoids ArrayBuffer pool over-allocation). */
export function requestBodyFromBuffer(body: Buffer): Uint8Array {
  return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
}
