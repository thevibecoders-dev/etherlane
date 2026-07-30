# Etherlane

Etherlane is a live audiovisual internet observatory. It translates public
routing updates from RIPE RIS and public measurements from RIPE Atlas into
light, movement and generative sound.

## Privacy boundary

- Public routing and measurement feeds only
- No packet capture or private traffic
- No payload inspection
- No database or browser storage
- A bounded in-memory display of at most 18 normalized events
- Raw upstream messages are discarded immediately after transformation

When neither public feed is available, the interface clearly switches to a
synthetic continuity stream.

## Development

Requires Node.js `>=22.13.0`.

```bash
npm install
npm run dev
npm run build
npm test
```
