# Etherlane

Etherlane is a live audiovisual internet observatory. It translates public
routing updates from RIPE RIS, public measurements from RIPE Atlas and public
Wikimedia change events into light, event-driven motion and a changing data
voice. Its EL-01 Signal Synth quantizes those events into generative music.

## Signal Synth

- Dual-oscillator polyphonic voices plus deterministic noise accents
- Low-pass filtering, envelopes, stereo placement, delay, reverb and compression
- Sixteen-step clock keeps bursty internet events musical
- RIPE RIS drives bass and route motifs
- RIPE Atlas drives short pulse voices
- Wikimedia changes drive chords and harmonic movement
- Four scales, four oscillator shapes and live tone/space controls
- No samples, recording, uploads or audio persistence

## Privacy boundary

- Public routing and measurement feeds only
- Public Wikimedia change metadata, excluding bots, usernames, titles and comments
- No packet capture or private traffic
- No payload inspection
- No database or browser storage
- A bounded in-memory display of at most 18 normalized events
- Raw upstream messages are discarded immediately after transformation
- Spoken strings use a local device voice only

When all three public feeds are unavailable, the interface clearly switches to
a synthetic continuity stream.

## Development

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
npm run build
npm test
```
