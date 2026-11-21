// Guest players: a random ID in an httpOnly cookie. No wallet or account needed to play.
import "server-only";
import { randomBytes } from "node:crypto";
import { cookies, headers } from "next/headers";
import { db } from "./db";

const COOKIE = "ya_player";
const ADJ = ["Frosty", "Snowy", "Icy", "Brisk", "Chilly", "Polar", "Glacial", "Sleety"];
const NOUN = ["Yeti", "Pine", "Peak", "Drift", "Flake", "Ridge", "Summit", "Sled"];

/** The current player, created on first visit. */
export async function getPlayer(create = true) {
  const jar = await cookies();
  const id = jar.get(COOKIE)?.value;
  const d = await db();
  if (id && /^[0-9a-f]{32}$/.test(id)) {
    const [p] = await d.query<{ id: string; name: string }>("SELECT id, name FROM players WHERE id = $1", [id]);
    if (p) return p;
  }
  if (!create) return null;
  const nid = randomBytes(16).toString("hex");
  const b = randomBytes(3);
  const name = `${ADJ[b[0] % ADJ.length]}${NOUN[b[1] % NOUN.length]}${100 + (b[2] % 900)}`;
  await d.query("INSERT INTO players (id, name) VALUES ($1, $2)", [nid, name]);
  jar.set(COOKIE, nid, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 365, path: "/" });
  return { id: nid, name };
}

export async function renamePlayer(id: string, name: unknown) {
  const n = typeof name === "string" ? name.trim() : "";
  if (!/^[A-Za-z0-9_ .-]{3,18}$/.test(n)) throw new Error("Names are 3–18 letters, numbers, spaces, dots, dashes or underscores.");
  const d = await db();
  const [taken] = await d.query("SELECT 1 FROM players WHERE lower(name) = lower($1) AND id <> $2", [n, id]);
  if (taken) throw new Error("That name is taken.");
  await d.query("UPDATE players SET name = $2 WHERE id = $1", [id, n]);
  return n;
}

export async function clientIp() {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] || h.get("x-real-ip") || "local").trim();
}
