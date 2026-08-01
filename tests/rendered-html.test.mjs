import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("builds Etherlane as the tactile Signal Oracle", async () => {
  const [page, css, globalCss, layout, version] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/oracle.css", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/app-version.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Tune into the living Internet/);
  assert.match(page, /Open the Signal Oracle/);
  assert.match(page, /never intercepted private traffic/);
  assert.match(page, /<SignalOracleVisual/);
  assert.match(page, /TILT TO TUNE/);
  assert.match(page, /HOLD TO LISTEN/);
  assert.match(page, /SIGNAL ALIGNMENT/);
  assert.match(page, /eventExplanation/);
  assert.match(page, /ZERO RETENTION · MEMORY ONLY/);
  assert.match(css, /\.oracle-canvas/);
  assert.match(css, /\.oracle-resonator/);
  assert.match(css, /\.oracle-layers/);
  assert.match(globalCss, /\.event-inspector/);
  assert.match(css, /@media \(max-width:760px\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /100dvh/);
  assert.match(layout, /og-signal-oracle\.png/);
  assert.match(layout, /The Signal Oracle/);
  assert.match(version, /2\.0\.0/);
});

test("uses live public observatories and labels non-live fallback honestly", async () => {
  const [page, pulse] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/pulse/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /wss:\/\/ris-live\.ripe\.net\/v1\/ws/);
  assert.match(page, /wss:\/\/atlas-stream\.ripe\.net\/stream/);
  assert.match(page, /stream\.wikimedia\.org\/v2\/stream\/recentchange/);
  assert.match(page, /\/api\/infrastructure/);
  assert.match(page, /\/api\/pulse/);
  assert.match(page, /live: false/);
  assert.match(page, /not a live Internet observation/);
  assert.match(pulse, /api\.ioda\.inetintel\.cc\.gatech\.edu/);
  assert.match(pulse, /RIPE Labs/);
  assert.match(pulse, /APNIC Blog/);
  assert.match(pulse, /X-Etherlane-Retention/);
  assert.doesNotMatch(page + pulse, /localStorage|sessionStorage|indexedDB|document\.cookie|MediaRecorder|getUserMedia/i);
});

test("renders the Signal Oracle without a 3D engine", async () => {
  const [oracle, page] = await Promise.all([
    readFile(new URL("../app/signal-oracle-visual.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
  ]);
  assert.match(oracle, /getContext\("2d"/);
  assert.match(oracle, /desynchronized: true/);
  assert.match(oracle, /requestAnimationFrame/);
  assert.match(oracle, /state\.holding/);
  assert.match(oracle, /state\.alignment/);
  assert.match(oracle, /state\.infrastructureRisk/);
  assert.match(page, /deviceorientation/);
  assert.match(page, /requestPermission/);
  assert.match(page, /ORACLE_LAYERS/);
  assert.doesNotMatch(oracle + page, /from "playcanvas"|new pc\./);
  assert.doesNotMatch(oracle, /localStorage|sessionStorage|indexedDB|document\.cookie/i);
});

test("keeps a stable drone and bounded independent stereo delays", async () => {
  const [audio, model] = await Promise.all([
    readFile(new URL("../app/listening-sea-audio.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/listening-sea-model.ts", import.meta.url), "utf8"),
  ]);
  assert.match(audio, /\[36\.708, 73\.416, 110\.0\]/);
  assert.match(audio, /createDynamicsCompressor/);
  assert.match(audio, /createConvolver/);
  assert.match(audio, /delayL\.connect\(feedbackL\)\.connect\(delayL\)/);
  assert.match(audio, /delayR\.connect\(feedbackR\)\.connect\(delayR\)/);
  assert.doesNotMatch(audio, /feedbackL\.connect\(delayR\)|feedbackR\.connect\(delayL\)/);
  assert.match(audio, /playDroplet/);
  assert.match(audio, /playFelt/);
  assert.match(audio, /playGlass/);
  assert.match(audio, /playWhisper/);
  assert.match(audio, /playSwell/);
  assert.match(model, /D minor pentatonic/);
  assert.match(model, /feedback: clamp\([^\n]+0\.16, 0\.44\)/);
  assert.doesNotMatch(audio + model, /MediaRecorder|localStorage|sessionStorage|indexedDB|document\.cookie|fetch\(/i);
});
