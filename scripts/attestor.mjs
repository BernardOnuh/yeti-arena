// Creates the game server's Ed25519 attestor key in web/.env.local (git-ignored) if there isn't one, and prints only
// the public key: that's what the Move arena stores (create_arena / set_attestor). The secret never leaves the server.
// usage: node scripts/attestor.mjs
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { join } from "node:path";
import { createRequire } from "node:module";

const ENV = join(import.meta.dirname, "..", "web", ".env.local");
const require = createRequire(join(import.meta.dirname, "..", "web", "package.json"));
const { ed25519 } = require("@noble/curves/ed25519");

let secret = existsSync(ENV) && readFileSync(ENV, "utf8").match(/^ATTESTOR_SECRET=([0-9a-fA-F]{64})$/m)?.[1];
if (!secret) {
  secret = randomBytes(32).toString("hex");
  appendFileSync(ENV, `ATTESTOR_SECRET=${secret}\n`, { mode: 0o600 });
  console.log("New attestor key saved to web/.env.local (git-ignored).");
}
const pub = Buffer.from(ed25519.getPublicKey(Buffer.from(secret, "hex"))).toString("hex");
console.log(`Attestor public key: ${pub}`);
