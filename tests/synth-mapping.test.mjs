// Offline unit tests for the pure, deterministic mapping helpers of the
// ambient synth engine. These import the TypeScript source directly — Node
// (>=22.18) strips the erasable type annotations at load time, so no build
// step is needed and no Web Audio context is touched.
import assert from "node:assert/strict";
import test from "node:test";

import {
  accentForSignal,
  clamp,
  ensembleDetune,
  midiToFrequency,
  padChordForHealth,
  quantizeToScale,
  scaleIntervals,
} from "../app/synth-math.mjs";

test("midiToFrequency anchors A4 to 440 Hz", () => {
  assert.ok(Math.abs(midiToFrequency(69) - 440) < 1e-9);
  assert.ok(Math.abs(midiToFrequency(57) - 220) < 1e-9); // one octave down
});

test("clamp keeps values inside range", () => {
  assert.equal(clamp(5, 0, 3), 3);
  assert.equal(clamp(-1, 0, 3), 0);
  assert.equal(clamp(2, 0, 3), 2);
});

test("quantizeToScale only ever produces in-scale pitch classes", () => {
  const key = "D";
  const scale = "aeolian";
  const root = 50; // D3
  const allowed = new Set(scaleIntervals[scale].map((i) => (root + i) % 12));
  for (let degree = -20; degree <= 40; degree += 1) {
    const midi = quantizeToScale(degree, scale, key);
    assert.ok(
      allowed.has(((midi % 12) + 12) % 12),
      `degree ${degree} -> midi ${midi} is out of scale`,
    );
  }
});

test("quantizeToScale is monotonic non-decreasing across ascending degrees", () => {
  let previous = -Infinity;
  for (let degree = 0; degree < 21; degree += 1) {
    const midi = quantizeToScale(degree, "dorian", "C");
    assert.ok(midi >= previous, `degree ${degree} went backwards`);
    previous = midi;
  }
});

test("padChordForHealth grows with the number of live feeds", () => {
  const off = padChordForHealth(0, "aeolian", "D");
  const one = padChordForHealth(1, "aeolian", "D");
  const two = padChordForHealth(2, "aeolian", "D");
  const three = padChordForHealth(3, "aeolian", "D");
  const six = padChordForHealth(6, "aeolian", "D");
  assert.equal(off.length, 2);
  assert.equal(one.length, 2);
  assert.equal(two.length, 3);
  assert.equal(three.length, 5);
  assert.equal(six.length, 6);
  // Root note is stable and shared by every voicing.
  assert.equal(one[0], off[0]);
  assert.equal(two[0], off[0]);
  assert.equal(three[0], off[0]);
});

test("pad harmony evolves while remaining inside the selected scale", () => {
  const chords = Array.from({ length: 6 }, (_, step) =>
    padChordForHealth(6, "dorian", "C", step),
  );
  assert.ok(new Set(chords.map((chord) => chord.join(","))).size >= 5);
  const allowed = new Set(scaleIntervals.dorian.map((interval) => interval % 12));
  for (const chord of chords) {
    for (const note of chord) assert.ok(allowed.has(note % 12));
  }
});

test("accentForSignal produces a musical, bounded voice per source", () => {
  const base = { kind: "PING RETURNED", magnitude: 60, tone: "cyan", timestamp: 0 };
  for (const source of [
    "RIS",
    "ATLAS",
    "WIKIMEDIA",
    "GITHUB",
    "HACKERNEWS",
    "BLOCKCHAIN",
    "SYNTHETIC",
  ]) {
    const voice = accentForSignal({ ...base, source }, "aeolian", "D");
    assert.ok(voice.velocity >= 0.16 && voice.velocity <= 0.7, `${source} velocity`);
    assert.ok(voice.pan >= -1 && voice.pan <= 1, `${source} pan`);
    assert.ok(voice.attack > 0 && voice.release > 0, `${source} envelope`);
    assert.ok(Number.isFinite(voice.midi), `${source} midi`);
  }
});

test("accentForSignal lowers pitch for withdrawal/removal kinds", () => {
  const announced = accentForSignal(
    { source: "RIS", kind: "ROUTE ANNOUNCED", magnitude: 50, tone: "violet", timestamp: 0 },
    "aeolian",
    "D",
  );
  const withdrawn = accentForSignal(
    { source: "RIS", kind: "ROUTE WITHDRAWN", magnitude: 50, tone: "coral", timestamp: 0 },
    "aeolian",
    "D",
  );
  assert.ok(withdrawn.midi < announced.midi, "withdrawn should sit lower than announced");
});

test("ensembleDetune is symmetric and correctly sized", () => {
  const spread = ensembleDetune(3, 12);
  assert.equal(spread.length, 3);
  assert.ok(Math.abs(spread[0] + spread[2]) < 1e-9, "outer voices mirror");
  assert.ok(Math.abs(spread[1]) < 1e-9, "centre voice is at 0 cents");
  assert.deepEqual(ensembleDetune(1, 12), [0]);
});
