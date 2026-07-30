# Etherlane

Etherlane is a live audiovisual internet observatory. It translates public
routing updates from RIPE RIS, public measurements from RIPE Atlas and public
Wikimedia change events into light, event-driven motion and a changing data
voice. Its EL-01 Signal Synth quantizes those events into generative music.

## Ambient Signal Synth

- Continuously evolving modal pads instead of a repeating step sequence
- Source-health harmony with smooth crossfades through six chord positions
- Signal-driven bowed accents, safely bounded ping-pong delay, hall reverb and limiting
- Distinct strings, glass and choir palettes with live shimmer updates
- Five atmosphere patches: Ether Bloom, Glass Orbit, Choir Void, Deep Rest and Signal Storm
- RIPE RIS, RIPE Atlas, Wikimedia, GitHub, Hacker News, blockchain and infrastructure signals
- Five scales, six keys and live tone, motion and space controls
- On-demand Piper neural voice plus the best available local device voice
- Full signal narration or sparse, slower dream phrases
- True 3.8-second convolution reverb around Piper audio
- Different 310 ms left and 470 ms right voice delays with bounded cross-feedback
- Four true-stereo binaural modes with a visible headphones advisory
- No samples, recording, uploads or audio persistence

## Visual fields

- Flow: the original perspective signal highway
- Neural: moving nodes create new multi-hop routes for every public event
- Matrix: normalized packet codes fall through the scene as ephemeral code rain
- Mobile uses a 24 fps, 1x-pixel-density profile with lower particle and glow counts
- Official Cloudflare, GitHub, Fastly and Google Cloud status changes add visual pressure
- Root DNS health is observed through two public resolvers and the root operator overview
- Confirmed disruption raises red signal density, network speed and musical tension

## Mobile experience

- Three large touch controls keep music, voice and the live stream reachable
- Full-screen mobile Signal Synth with touch-sized controls
- Dynamic viewport and safe-area support for modern iOS and Android devices
- Compact layouts for narrow portrait and short landscape screens

## Privacy boundary

- Six public, read-only routing, measurement, knowledge, code, conversation and ledger feeds
- One normalized infrastructure-health channel backed by official public status endpoints
- Monitor failures remain `unknown`; they are never presented as an outage
- Public Wikimedia change metadata, excluding bots, usernames, titles and comments
- Public GitHub event types only, excluding actor and repository names
- Hacker News aggregate change counts only, excluding item IDs and profile names
- Public blockchain transaction shape only, excluding addresses and transaction hashes
- No packet capture or private traffic
- No payload inspection
- No database or browser storage for signal data
- A bounded in-memory display of at most 18 normalized events
- Raw upstream messages are discarded immediately after transformation
- Piper downloads a reusable neural model on first use; inference then runs in the browser
- The optional voice model may remain in device storage, but signal phrases are never stored
- No external TTS service receives spoken strings
- Voice ambience and binaural audio are generated locally and never recorded

When all six public activity feeds are unavailable, the interface clearly
switches to a synthetic continuity stream. Infrastructure observations remain
separate so monitoring uncertainty cannot create a false incident.

## Development

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
npm run build
npm test
```
