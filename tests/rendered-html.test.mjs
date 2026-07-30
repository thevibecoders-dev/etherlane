import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the Etherlane experience and metadata", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>Etherlane — Stand inside the flow<\/title>/i);
  assert.match(html, /ETHERLANE/);
  assert.match(html, /STAND INSIDE/);
  assert.match(html, /THE FLOW/);
  assert.match(html, /ZERO RETENTION/);
  assert.match(html, /RIPE RIS/);
  assert.match(html, /RIPE ATLAS/);
  assert.match(html, /WIKIMEDIA/);
  assert.match(html, /AMBIENT SYNTH/);
  assert.match(html, /SIGNAL SYNTH/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|VibeVeilig/i);
});

test("uses three public read-only feeds and never adds persistence", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /wss:\/\/ris-live\.ripe\.net\/v1\/ws/);
  assert.match(page, /wss:\/\/atlas-stream\.ripe\.net\/stream/);
  assert.match(page, /https:\/\/stream\.wikimedia\.org\/v2\/stream\/recentchange/);
  assert.match(page, /includeRaw:\s*false/);
  assert.match(page, /slice\(0,\s*18\)/);
  assert.match(page, /SpeechSynthesisUtterance/);
  assert.match(page, /voice\.localService/);
  assert.match(page, /data\.bot === true/);
  assert.doesNotMatch(page, /data\.(user|comment|title)\b/);
  assert.doesNotMatch(page, /localStorage|sessionStorage|indexedDB|document\.cookie/i);
  assert.doesNotMatch(packageJson, /react-loading-skeleton|drizzle-orm|drizzle-kit/);
  assert.match(layout, /lang="en"/);

  await assert.rejects(
    access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)),
  );
});

test("expands both routing vocabulary and signal-driven visual forms", async () => {
  const [page, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  for (const kind of [
    "SESSION PULSE",
    "BGP SESSION OPEN",
    "BGP NOTIFICATION",
    "PEER STATE",
    "ROUTE EXCHANGE",
    "HIGH LATENCY",
    "PAGE CREATED",
    "CATEGORY SHIFT",
  ]) {
    assert.match(page, new RegExp(kind));
  }

  assert.match(page, /type SignalShape = "beam" \| "ring" \| "packet" \| "spark"/);
  assert.match(page, /shockwavesRef/);
  assert.match(css, /@keyframes transmit/);
});

test("ships an immersive ambient synth without recording or persistence", async () => {
  const [page, engine, math, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/synth-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/synth-math.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  for (const audioNode of [
    "createOscillator",
    "createBiquadFilter",
    "createDelay",
    "createConvolver",
    "createDynamicsCompressor",
    "createStereoPanner",
  ]) {
    assert.match(engine, new RegExp(audioNode));
  }

  // Ambient, event-driven design — not a step sequencer.
  assert.doesNotMatch(engine, /% 16|step \+ 1|BPM|tempo/);
  assert.match(engine, /padChordForHealth/);
  assert.match(engine, /makeHallImpulse/);
  assert.match(engine, /now - this\.lastAccentAt < 70/); // precedence-effect spacing
  assert.match(engine, /setHealth/);
  assert.match(math, /quantizeToScale/);
  assert.match(math, /padChordForHealth/);
  assert.doesNotMatch(engine, /MediaRecorder|localStorage|sessionStorage|indexedDB|document\.cookie/i);

  for (const control of ["VOICE", "HARMONY", "TONE", "MOTION", "WARMTH", "REVERB"]) {
    assert.match(page, new RegExp(control));
  }

  assert.match(page, /Raw messages never enter the audio graph and nothing is recorded/);
  assert.match(css, /\.synth-card/);
});
