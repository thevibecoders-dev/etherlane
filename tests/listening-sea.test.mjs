import assert from "node:assert/strict";
import test from "node:test";

import { eventExplanation, mapEventToSound } from "../app/listening-sea-model.ts";

const base = {
  id: "test",
  source: "ROUTING",
  kind: "ROUTE ANNOUNCEMENT",
  title: "A route entered the table",
  detail: "AS64512 · 198.51.100.0/24",
  timestamp: 0,
  magnitude: 54,
  confidence: 96,
  severity: "nominal",
  live: true,
  latitude: 52.37,
  longitude: 4.9,
  destinationLatitude: 35.68,
  destinationLongitude: 139.69,
  hops: 7,
};

test("the same observation always produces the same semantic sound", () => {
  assert.deepEqual(mapEventToSound(base), mapEventToSound(base));
});

test("all sound parameters remain musically and technically bounded", () => {
  for (const source of ["ROUTING", "MEASUREMENT", "KNOWLEDGE", "PUBLICATION", "INFRASTRUCTURE", "SYNTHETIC"]) {
    for (const severity of ["nominal", "notice", "degraded", "outage"]) {
      const sound = mapEventToSound({ ...base, source, severity, magnitude: 100, confidence: 0, rtt: 900, hops: 40 });
      assert.ok(sound.midi >= 45 && sound.midi <= 65);
      assert.ok(sound.velocity >= 0.1 && sound.velocity <= 0.54);
      assert.ok(sound.duration >= 0.35 && sound.duration <= 5.8);
      assert.ok(sound.cutoff >= 650 && sound.cutoff <= 4800);
      assert.ok(sound.wet >= 0.16 && sound.wet <= 0.72);
      assert.ok(sound.delay >= 0.055 && sound.delay <= 0.32);
      assert.ok(sound.feedback >= 0.16 && sound.feedback <= 0.44);
      assert.ok(sound.pan >= -0.82 && sound.pan <= 0.82);
    }
  }
});

test("RTT, path length and confidence have explainable mappings", () => {
  const short = mapEventToSound({ ...base, rtt: 20, hops: 2, confidence: 30 });
  const long = mapEventToSound({ ...base, rtt: 250, hops: 12, confidence: 98 });
  assert.ok(long.delay > short.delay);
  assert.ok(long.feedback > short.feedback);
  assert.ok(long.cutoff > short.cutoff);
  assert.match(eventExplanation({ ...base, rtt: 42.4 }), /42\.4 ms RTT/);
});
