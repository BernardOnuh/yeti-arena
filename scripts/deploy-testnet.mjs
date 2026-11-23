// Publishes the Yeti Arena Move package to Sui testnet with your own Sui CLI (its active address pays and signs; this
// script never reads keys), creates the Arena with the game server's attestor public key, creates Season 1, and writes
// the object IDs to web/.env.local and move/deployments/testnet.json.
// usage: node scripts/attestor.mjs && node scripts/deploy-testnet.mjs
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const ROOT = join(import.meta.dirname, "..");
const ENV = join(ROOT, "web", ".env.local");
const SUI = process.env.SUI_BIN || "sui";
const GAME_VERSION = Number(readFileSync(join(ROOT, "web/src/game/sim.ts"), "utf8").match(/GAME_VERSION\s*=\s*(\d+)/)[1]);
const SEASON = { number: 1, name: "Season 1: First Snow", starts: Date.parse("2026-11-16T00:00:00Z"), ends: Date.parse("2027-01-01T00:00:00Z"), threshold: 1500 };

const sui = (args, json = true) => {
  const out = execFileSync(SUI, json ? [...args, "--json"] : args, { encoding: "utf8", maxBuffer: 64 << 20, stdio: ["ignore", "pipe", "inherit"] });
  return json ? JSON.parse(out.slice(out.indexOf("{"))) : out.trim();
};
// Created objects in a transaction result, whatever nesting the CLI version uses.
function created(result, suffix) {
  const found = [];
  const walk = v => {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === "object") {
      if (typeof v.objectType === "string" && v.objectType.endsWith(suffix) && v.objectId) found.push(v.objectId);
      if (v.type === "published" && suffix === "published" && v.packageId) found.push(v.packageId);
      Object.values(v).forEach(walk);
    }
  };
  walk(result);
  if (!found.length) throw new Error(`no ${suffix} in the transaction result`);
  return found[0];
}
const u8vec = bytes => `vector[${Array.from(bytes, b => `${b}u8`).join(",")}]`;

// 0. checks: testnet, an active address with gas, and the attestor key
const env = sui(["client", "active-env"], false);
if (env !== "testnet") throw new Error(`The Sui CLI is on "${env}". Run: sui client switch --env testnet`);
const address = sui(["client", "active-address"], false);
const secret = existsSync(ENV) && readFileSync(ENV, "utf8").match(/^ATTESTOR_SECRET=([0-9a-fA-F]{64})$/m)?.[1];
if (!secret) throw new Error("No attestor key yet. Run: node scripts/attestor.mjs");
const { ed25519 } = createRequire(join(ROOT, "web", "package.json"))("@noble/curves/ed25519");
const attestor = ed25519.getPublicKey(Buffer.from(secret, "hex"));
console.log(`Deploying from ${address} on testnet. Attestor ${Buffer.from(attestor).toString("hex")}`);

// 1. publish
const pub = sui(["client", "publish", join(ROOT, "move", "yeti_arena"), "--gas-budget", "300000000"]);
const pkg = created(pub, "published");
console.log(`Package ${pkg}  (tx ${pub.digest})`);

// 2. the arena (shared) and its AdminCap (to you)
const a = sui(["client", "ptb", "--move-call", `${pkg}::arena::create_arena_entry`, u8vec(attestor), `${GAME_VERSION}u64`, "--gas-budget", "50000000"]);
const arena = created(a, "::arena::Arena"), cap = created(a, "::arena::AdminCap");
console.log(`Arena ${arena}\nAdminCap ${cap}  (tx ${a.digest})`);

// 3. Season 1, with the hash of the game rules it scores
const rules = createHash("sha256").update(readFileSync(join(ROOT, "web/src/game/sim.ts"))).digest();
const s = sui(["client", "ptb", "--move-call", `${pkg}::arena::create_season`, `@${cap}`, `@${arena}`, `${SEASON.number}u64`, `"${SEASON.name}"`,
  `${SEASON.starts}u64`, `${SEASON.ends}u64`, `${SEASON.threshold}u64`, u8vec(rules), "--gas-budget", "50000000"]);
const season = created(s, "::arena::Season");
console.log(`Season ${season}  (tx ${s.digest})`);

// 4. record it
const vars = { NEXT_PUBLIC_SUI_NETWORK: "testnet", NEXT_PUBLIC_SUI_PACKAGE: pkg, NEXT_PUBLIC_SUI_ARENA: arena, NEXT_PUBLIC_SUI_SEASON: season };
let text = readFileSync(ENV, "utf8");
for (const [k, v] of Object.entries(vars)) text = new RegExp(`^${k}=.*$`, "m").test(text) ? text.replace(new RegExp(`^${k}=.*$`, "m"), `${k}=${v}`) : text + `${k}=${v}\n`;
writeFileSync(ENV, text, { mode: 0o600 });
mkdirSync(join(ROOT, "move", "deployments"), { recursive: true });
writeFileSync(join(ROOT, "move", "deployments", "testnet.json"), JSON.stringify({
  network: "testnet", deployer: address, package: pkg, arena, adminCap: cap, season, gameVersion: GAME_VERSION,
  attestor: Buffer.from(attestor).toString("hex"), rulesHash: rules.toString("hex"), seasonDefinition: SEASON,
  txs: { publish: pub.digest, arena: a.digest, season: s.digest }, at: new Date().toISOString(),
}, null, 2) + "\n");
console.log("\nWrote web/.env.local and move/deployments/testnet.json. Restart the web server to switch on-chain recording on.");
