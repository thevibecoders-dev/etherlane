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
  assert.match(html, /GITHUB/);
  assert.match(html, /BLOCKCHAIN/);
  assert.match(html, /CORE NETWORK/);
  assert.match(html, /ROOT DNS/);
  assert.match(html, /CLOUDFLARE/);
  assert.match(html, /NEURAL/);
  assert.match(html, /MATRIX/);
  assert.match(html, /AMBIENT SYNTH/);
  assert.match(html, /SIGNAL SYNTH/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|VibeVeilig/i);
});

test("uses six activity feeds plus infrastructure health and never adds persistence", async () => {
  const [page, layout, packageJson, infrastructureRoute] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../app/api/infrastructure/route.ts", import.meta.url), "utf8"),
  ]);

  assert.match(page, /wss:\/\/ris-live\.ripe\.net\/v1\/ws/);
  assert.match(page, /wss:\/\/atlas-stream\.ripe\.net\/stream/);
  assert.match(page, /https:\/\/stream\.wikimedia\.org\/v2\/stream\/recentchange/);
  assert.match(page, /https:\/\/api\.github\.com\/events\?per_page=20/);
  assert.match(page, /https:\/\/hacker-news\.firebaseio\.com\/v0\/updates\.json/);
  assert.match(page, /wss:\/\/ws\.blockchain\.info\/inv/);
  assert.match(page, /fetch\("\/api\/infrastructure"/);
  assert.match(page, /CORE SERVICE OUTAGE/);
  assert.match(page, /ROOT CONSENSUS SHIFT/);
  assert.match(page, /includeRaw:\s*false/);
  assert.match(page, /slice\(0,\s*18\)/);
  assert.match(page, /SpeechSynthesisUtterance/);
  assert.match(page, /voice\.localService/);
  assert.match(page, /data\.bot === true/);
  assert.doesNotMatch(page, /data\.(user|comment|title)\b/);
  assert.doesNotMatch(page, /localStorage|sessionStorage|indexedDB|document\.cookie/i);
  assert.doesNotMatch(packageJson, /react-loading-skeleton|drizzle-orm|drizzle-kit/);
  assert.match(layout, /lang="en"/);
  assert.match(infrastructureRoute, /https:\/\/www\.cloudflarestatus\.com\/api\/v2\/summary\.json/);
  assert.match(infrastructureRoute, /https:\/\/www\.githubstatus\.com\/api\/v2\/summary\.json/);
  assert.match(infrastructureRoute, /https:\/\/www\.fastlystatus\.com\/api\/v2\/summary\.json/);
  assert.match(infrastructureRoute, /https:\/\/status\.cloud\.google\.com\/incidents\.json/);
  assert.match(infrastructureRoute, /https:\/\/dns\.google\/resolve\?name=\./);
  assert.match(infrastructureRoute, /https:\/\/cloudflare-dns\.com\/dns-query\?name=\./);
  assert.match(infrastructureRoute, /https:\/\/root-servers\.org\//);
  assert.match(infrastructureRoute, /state:\s*"unknown",\s*description:\s*"Monitor unavailable"/);
  assert.match(infrastructureRoute, /stale-while-revalidate=120/);
  assert.doesNotMatch(infrastructureRoute, /state:\s*"outage",\s*description:\s*"Monitor unavailable"/);

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
    "CODE PUSHED",
    "THREAD BURST",
    "BLOCK PROPAGATED",
    "TRANSACTION RELAYED",
  ]) {
    assert.match(page, new RegExp(kind));
  }

  assert.match(page, /type SignalShape = "beam" \| "ring" \| "packet" \| "spark"/);
  assert.match(page, /shockwavesRef/);
  assert.match(page, /type VisualizationMode = "flow" \| "neural" \| "matrix"/);
  assert.match(page, /drawNeural/);
  assert.match(page, /drawMatrix/);
  assert.match(page, /route:\s*number\[\]/);
  assert.match(page, /node\.x \+= node\.vx/);
  assert.match(page, /packet\.route\.forEach/);
  assert.match(page, /routeProgress/);
  assert.match(page, /infrastructureRiskRef/);
  assert.match(page, /1000 \/ 24/);
  assert.match(page, /devicePixelRatio = compact \? 1/);
  assert.match(css, /@keyframes transmit/);
  assert.match(css, /\.visualizer-switch/);
  assert.match(css, /\.infrastructure-panel/);
  assert.match(css, /\.etherlane-shell\.is-disrupted/);
  assert.match(css, /@keyframes distress-background/);
  assert.match(css, /\.signal-canvas\s*\{[\s\S]*position:\s*fixed/);
});

test("ships an immersive generative synth without recording or persistence", async () => {
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

  // Ambient pads remain event-driven; the optional drums use a precise
  // AudioContext look-ahead scheduler.
  assert.match(engine, /scheduleRhythmWindow/);
  assert.match(engine, /padChordForHealth/);
  assert.match(engine, /makeHallImpulse/);
  assert.match(engine, /now - this\.lastAccentAt < 70/); // precedence-effect spacing
  assert.match(engine, /setHealth/);
  assert.match(engine, /scheduleEvolution/);
  assert.match(engine, /timbreChanged/);
  assert.match(engine, /padClearTimer/);
  assert.match(engine, /feedbackL/);
  assert.match(engine, /feedbackR/);
  assert.match(engine, /breathBuffer/);
  assert.match(engine, /palette === "choir"/);
  assert.match(engine, /this\.nextRhythmAt < horizon/);
  assert.match(engine, /window\.setInterval\(\(\) => this\.scheduleRhythmWindow\(\), 25\)/);
  assert.match(engine, /triggerKick/);
  assert.match(engine, /triggerNoiseDrum/);
  assert.match(engine, /triggerPercussion/);
  assert.match(engine, /triggerBass/);
  assert.match(engine, /triggerDataSynth/);
  assert.match(engine, /this\.rhythmStep \+= 1/);
  assert.doesNotMatch(engine, /this\.rhythmStep\s*=\s*\(this\.rhythmStep \+ 1\) % 32/);
  assert.match(engine, /frequency\.exponentialRampToValueAtTime/);
  assert.match(engine, /drumNoiseBuffer/);
  assert.match(engine, /drumBus\.gain\.value = 0\.92/);
  assert.match(engine, /drumBus\.connect\(drumPresence\)\.connect\(limiter\)/);
  assert.match(engine, /applyDataModulation/);
  assert.match(engine, /setTargetAtTime\(this\.modulation\.driftRate/);
  assert.match(engine, /0\.43/);
  assert.doesNotMatch(engine, /feedback\.connect\(delayL\)|feedback\.connect\(delayR\)/);
  assert.match(math, /quantizeToScale/);
  assert.match(math, /padChordForHealth/);
  assert.match(math, /rhythmStepFor/);
  assert.match(math, /modulationForSignal/);
  assert.match(math, /melodicDegreeFor/);
  assert.match(math, /phraseSeed/);
  assert.match(math, /const progression = \[0, 3, 5, 1, 4, 2, 6/);
  assert.match(math, /label:\s*"EDM"/);
  assert.match(math, /label:\s*"TECHNO"/);
  assert.match(math, /label:\s*"IDM"/);
  assert.doesNotMatch(engine, /MediaRecorder|localStorage|sessionStorage|indexedDB|document\.cookie/i);
  assert.doesNotMatch(engine, /fetch\(|new Audio\(|createMediaElementSource/);

  for (const control of [
    "VOICE",
    "HARMONY",
    "TONE",
    "MOTION",
    "WARMTH",
    "VOICE REVERB",
    "DATA RHYTHM",
    "PROCEDURAL DRUM MACHINE",
    "KICK LIGHT",
    "Live data modulation matrix",
  ]) {
    assert.match(page, new RegExp(control));
  }

  assert.match(page, /Raw messages never enter the audio graph and nothing is recorded/);
  assert.match(css, /\.synth-card/);
  assert.match(css, /\.kick-light/);
  assert.match(css, /\.rhythm-grid/);
  assert.match(css, /\.light-colors/);
  assert.match(css, /\.data-modulation-grid/);
  assert.match(page, /prefers-reduced-motion: reduce/);
  assert.match(page, /light\.animate/);
});

test("keeps enhanced voice processing local and ships touch-ready mobile layouts", async () => {
  const [page, engine, css, layout, neuralVoice, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/synth-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/neural-voice.ts", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /voiceQualityScore/);
  assert.match(page, /\.filter\(\(voice\) => voice\.localService\)/);
  assert.match(page, /VOICE PROCESSOR/);
  assert.match(page, /VOICE REVERB/);
  assert.match(engine, /class EtherlaneVoiceSpace/);
  assert.match(engine, /createConvolver/);
  assert.match(engine, /preDelay/);
  assert.match(engine, /decodeAudioData/);
  assert.match(engine, /source\.playbackRate\.value/);
  assert.match(engine, /delayL\.delayTime\.value = 0\.31/);
  assert.match(engine, /delayR\.delayTime\.value = 0\.47/);
  assert.match(neuralVoice, /import\("@realtimex\/piper-tts-web"\)/);
  assert.match(neuralVoice, /en_US-hfc_female-medium/);
  assert.match(neuralVoice, /en_US-hfc_male-medium/);
  assert.match(neuralVoice, /en_GB-cori-high/);
  assert.match(neuralVoice, /en_US-ryan-high/);
  assert.match(neuralVoice, /TtsSession\._instance = null/);
  assert.match(neuralVoice, /HFC NOCTURNE/);
  assert.match(neuralVoice, /RYAN DEEPFIELD/);
  assert.match(page, /A new voice enters the ether/);
  assert.match(css, /\.neural-voice-grid/);
  assert.match(packageJson, /@realtimex\/piper-tts-web/);
  assert.match(packageJson, /onnxruntime-web/);
  assert.match(page, /spoken text and signal content do not/);
  assert.doesNotMatch(page + engine + neuralVoice, /getUserMedia|MediaRecorder|api\.openai|elevenlabs|googleapis/i);

  assert.match(layout, /width:\s*"device-width"/);
  assert.match(layout, /viewportFit:\s*"cover"/);
  assert.match(css, /@media \(max-width: 720px\)/);
  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*1fr\)/);
  assert.match(css, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /100dvh/);
  assert.match(css, /@media \(hover: none\) and \(pointer: coarse\)/);
});

test("implements selectable true-stereo binaural modes and an expanded patch bank", async () => {
  const [page, engine, math, css] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/synth-engine.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/synth-math.mjs", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
  ]);

  for (const label of [
    "ETHER BLOOM",
    "GLASS ORBIT",
    "CHOIR VOID",
    "DEEP REST",
    "SIGNAL STORM",
    "DELTA REST",
    "THETA DRIFT",
    "ALPHA CALM",
    "SOFT FOCUS",
  ]) {
    assert.match(page + engine, new RegExp(label));
  }

  assert.match(engine, /class EtherlaneBinaural/);
  assert.match(engine, /createChannelMerger\(2\)/);
  assert.match(engine, /left\.connect\(leftGain\)\.connect\(merger,\s*0,\s*0\)/);
  assert.match(engine, /right\.connect\(rightGain\)\.connect\(merger,\s*0,\s*1\)/);
  assert.match(engine, /bypasses all reverb and delay/);
  assert.match(math, /function binauralPair/);
  assert.match(page, /USE HEADPHONES/);
  assert.match(page, /not medical treatment/);
  assert.match(page, /dreamPhraseFor/);
  assert.match(css, /\.binaural-grid/);
  assert.match(css, /\.patch-grid/);
});
