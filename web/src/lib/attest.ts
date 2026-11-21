// The result attestation the game server signs and the Move module verifies (yeti_arena::arena::result_message):
// "YETI_ARENA_RESULT_V1" followed by the BCS encoding of
//   AttestedResult { arena: ID, season: ID, player: address, run_id: vector<u8>, score: u64, game_version: u64 }.
import { ed25519 } from "@noble/curves/ed25519";

export const DOMAIN = new TextEncoder().encode("YETI_ARENA_RESULT_V1");

const hexToBytes = (h: string) => {
  const s = h.replace(/^0x/, "");
  if (!/^[0-9a-fA-F]*$/.test(s) || s.length % 2) throw new Error("bad hex");
  return Uint8Array.from(s.match(/../g) ?? [], b => parseInt(b, 16));
};
export const toHex = (b: Uint8Array) => Array.from(b, x => x.toString(16).padStart(2, "0")).join("");

/** A Sui address or object ID as its 32 bytes (short forms are left-padded). */
export function address32(a: string) {
  const s = a.replace(/^0x/, "").toLowerCase();
  if (!/^[0-9a-f]{1,64}$/.test(s)) throw new Error(`not a Sui address: ${a}`);
  return hexToBytes(s.padStart(64, "0"));
}
function uleb128(n: number) {
  const out: number[] = [];
  do { let b = n & 0x7f; n >>>= 7; if (n) b |= 0x80; out.push(b); } while (n);
  return out;
}
function u64(n: bigint) {
  const out = new Uint8Array(8);
  for (let i = 0; i < 8; i++) { out[i] = Number(n & 0xffn); n >>= 8n; }
  return out;
}

export function resultMessage(m: { arena: string; season: string; player: string; runId: Uint8Array; score: bigint; gameVersion: bigint }) {
  const parts = [DOMAIN, address32(m.arena), address32(m.season), address32(m.player), Uint8Array.from(uleb128(m.runId.length)), m.runId, u64(m.score), u64(m.gameVersion)];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export const publicKeyOf = (secret: Uint8Array) => ed25519.getPublicKey(secret);
export const signMessage = (secret: Uint8Array, msg: Uint8Array) => ed25519.sign(msg, secret);
export { hexToBytes };
