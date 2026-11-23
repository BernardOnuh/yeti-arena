// The game server's Ed25519 attestor key: it signs verified results for the Move module to check. The secret is read
// from ATTESTOR_SECRET (64 hex characters, in web/.env.local; scripts/attestor.mjs creates it) and never leaves the server.
import "server-only";
import { hexToBytes, publicKeyOf, signMessage, toHex } from "@/lib/attest";

function secret() {
  const s = process.env.ATTESTOR_SECRET?.trim().replace(/^0x/, "");
  if (!s || !/^[0-9a-fA-F]{64}$/.test(s)) return null;
  return hexToBytes(s);
}
export const attestorReady = () => secret() !== null;
export const attestorPublicKey = () => { const k = secret(); return k ? toHex(publicKeyOf(k)) : null; };
export function attest(message: Uint8Array) {
  const k = secret();
  if (!k) throw new Error("ATTESTOR_SECRET is not set");
  return toHex(signMessage(k, message));
}
