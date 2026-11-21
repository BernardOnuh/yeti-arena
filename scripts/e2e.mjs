// End-to-end check of Yeti Arena in real (headless) Chrome: play Ice Dash, get verified, see the leaderboard, try a cheat.
// Needs Google Chrome, the web app running (npm run dev).
// node scripts/e2e.mjs [http://127.0.0.1:3300] [./e2e-shots]
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";

const [base = "http://127.0.0.1:3300", shots = "./shots"] = process.argv.slice(2);
// E2E_WIDTH=390 runs the whole flow at phone size.
const WIDTH = Number(process.env.E2E_WIDTH) || 1280;
const MOBILE = WIDTH < 600;
mkdirSync(shots, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function browser(name) {
  const port = 9400 + Math.floor(Math.random() * 400);
  const proc = spawn("/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    ["--headless=new", `--remote-debugging-port=${port}`, `--user-data-dir=${mkdtempSync(tmpdir() + "/ya-")}`, "--window-size=1280,900", "about:blank"], { stdio: "ignore" });
  let target;
  for (let i = 0; i < 60 && !target; i++) { await sleep(250); try { target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === "page"); } catch {} }
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise(r => (ws.onopen = r));
  let id = 0; const pending = new Map(); const errors = [];
  ws.onmessage = e => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result ?? m); pending.delete(m.id); }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description?.split("\n")[0]);
  };
  const send = (method, params = {}) => new Promise(r => { pending.set(++id, r); ws.send(JSON.stringify({ id, method, params })); });
  await send("Page.enable"); await send("Runtime.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: WIDTH, height: MOBILE ? 844 : 900, deviceScaleFactor: MOBILE ? 2 : 1, mobile: MOBILE });
  const evalJs = async expr => (await send("Runtime.evaluate", { expression: expr, awaitPromise: true, returnByValue: true })).result?.value;
  const b = {
    name, errors,
    async go(path) { await send("Page.navigate", { url: base + path }); await sleep(2500); },
    text: () => evalJs("document.body.innerText"),
    async waitFor(re, ms = 30000) {
      const t0 = Date.now();
      while (Date.now() - t0 < ms) { const t = await b.text(); if (new RegExp(re, "i").test(t)) return t; await sleep(500); } // case-insensitive: some headings are styled in capitals
      throw new Error(`[${name}] timed out waiting for /${re}/. Page says:\n${(await b.text()).slice(0, 800)}`);
    },
    async click(label) {
      // Retry while the page hydrates: a button only works once React is running.
      for (let i = 0; i < 20; i++) {
        const found = await evalJs(`[...document.querySelectorAll("button, a")].some(e => e.innerText.trim().startsWith(${JSON.stringify(label)}))`);
        if (found) break;
        await sleep(500);
      }
      const ok = await evalJs(`(() => { const el = [...document.querySelectorAll("button, a")].find(e => e.innerText.trim() === ${JSON.stringify(label)} || e.innerText.trim().startsWith(${JSON.stringify(label)})); if (!el) return false; el.click(); return true; })()`);
      if (!ok) throw new Error(`[${name}] no button "${label}". Page says:\n${(await b.text()).slice(0, 600)}`);
      await sleep(700);
    },
    /** Sets the input labelled `label` (its <label> text or aria-label). */
    async fill(label, value) {
      const ok = await evalJs(`(() => { const L = ${JSON.stringify(label)};
        const el = [...document.querySelectorAll("label")].find(l => l.innerText.trim().startsWith(L))?.querySelector("input") ?? document.querySelector(\`input[aria-label="\${L}"]\`);
        if (!el) return false;
        Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set.call(el, ${JSON.stringify(value)}); el.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`);
      if (!ok) throw new Error(`[${name}] no field "${label}"`);
    },
    async press(key) {
      for (const type of ["keyDown", "keyUp"]) await send("Input.dispatchKeyEvent", { type, key, code: key, windowsVirtualKeyCode: { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39 }[key] });
    },
    async shot(file) {
      const r = await send("Page.captureScreenshot", { format: "png", captureBeyondViewport: true });
      writeFileSync(`${shots}/${file}.png`, Buffer.from(r.data, "base64"));
    },
    close() { ws.close(); proc.kill(); },
  };
  return b;
}


const p = await browser("player");
const log = s => console.log("✓ " + s);
try {
  await p.go("/");
  await p.waitFor("every high score has");
  await p.shot("1-home");
  await p.go("/play");
  await p.click("Start run");
  await p.waitFor("Score", 15000);
  // Play: tap random moves for a few seconds, then let the run end.
  for (let i = 0; i < 12; i++) {
    await p.press(["ArrowLeft", "ArrowRight", "ArrowUp"][i % 3]);
    await sleep(350);
    if (i === 6) await p.shot("2-playing");
  }
  const t = await p.waitFor("Verified by replay|Not verified", 90000);
  if (!/Verified by replay/.test(t)) throw new Error("run was not verified:\n" + t.slice(0, 400));
  log("run verified by server replay: " + (t.match(/Verified by replay\s+([\d,]+)/)?.[1] ?? "?"));
  await p.shot("3-result");
  await p.go("/leaderboard");
  await p.waitFor("YOU");
  log("player appears on the leaderboard");
  await p.shot("4-leaderboard");
  await p.go("/fairness");
  await p.click("Claim a score of 99,999");
  const r = await p.waitFor("Rejected", 15000);
  if (!/doesn't match the replay/.test(r)) throw new Error("expected a score-mismatch rejection");
  log("forged score rejected: score doesn't match the replay");
  await p.click("Send 30 moves");
  await p.waitFor("beyond human play", 15000);
  log("bot-speed input rejected");
  await p.shot("5-fairness");
  if (p.errors.length) console.log("page errors:", p.errors);
} catch (e) {
  await p.shot("error").catch(() => {});
  console.error(e.message);
  process.exitCode = 1;
} finally {
  p.close();
}
