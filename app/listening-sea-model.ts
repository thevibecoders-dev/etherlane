export type ListeningMode = "drift" | "observe" | "focus";

export type SeaSource =
  | "ROUTING"
  | "MEASUREMENT"
  | "KNOWLEDGE"
  | "PUBLICATION"
  | "INFRASTRUCTURE"
  | "SYNTHETIC";

export type SeaSeverity = "nominal" | "notice" | "degraded" | "outage";

export type SeaEvent = {
  id: string;
  source: SeaSource;
  kind: string;
  title: string;
  detail: string;
  timestamp: number;
  magnitude: number;
  confidence: number;
  severity: SeaSeverity;
  live: boolean;
  latitude?: number;
  longitude?: number;
  destinationLatitude?: number;
  destinationLongitude?: number;
  rtt?: number;
  hops?: number;
  persistence?: number;
};

export type SoundMap = {
  midi: number;
  frequency: number;
  velocity: number;
  duration: number;
  cutoff: number;
  wet: number;
  delay: number;
  feedback: number;
  pan: number;
  roughness: number;
};

export const SOURCE_COLORS: Record<SeaSource, string> = {
  ROUTING: "#8f7cff",
  MEASUREMENT: "#6ee7ff",
  KNOWLEDGE: "#82ffd0",
  PUBLICATION: "#f2c879",
  INFRASTRUCTURE: "#ff6f85",
  SYNTHETIC: "#aab7d8",
};

export const SOURCE_LABELS: Record<SeaSource, string> = {
  ROUTING: "RIPE RIS",
  MEASUREMENT: "RIPE Atlas",
  KNOWLEDGE: "Wikimedia",
  PUBLICATION: "Public feeds",
  INFRASTRUCTURE: "Internet health",
  SYNTHETIC: "Quiet fallback",
};

const SCALE = [0, 3, 5, 7, 10]; // D minor pentatonic: stable, consonant and bounded.
const BASE_DEGREES: Record<SeaSource, number> = {
  ROUTING: 0,
  MEASUREMENT: 2,
  KNOWLEDGE: 4,
  PUBLICATION: 1,
  INFRASTRUCTURE: -1,
  SYNTHETIC: 0,
};

export function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function midiToFrequency(midi: number) {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function mapEventToSound(event: SeaEvent): SoundMap {
  const identity = hashText(`${event.source}:${event.kind}:${event.detail.split("·")[0]}`);
  const degree = BASE_DEGREES[event.source] + (identity % 3);
  const octave = Math.floor(degree / SCALE.length);
  const scaleIndex = ((degree % SCALE.length) + SCALE.length) % SCALE.length;
  const midi = clamp(50 + octave * 12 + SCALE[scaleIndex], 45, 65);
  const normalizedMagnitude = Math.log1p(clamp(event.magnitude, 0, 100)) / Math.log(101);
  const severity = { nominal: 0, notice: 0.22, degraded: 0.58, outage: 1 }[event.severity];
  const distance =
    typeof event.longitude === "number" && typeof event.destinationLongitude === "number"
      ? clamp(Math.abs(event.destinationLongitude - event.longitude) / 180, 0, 1)
      : 0.46;

  return {
    midi,
    frequency: midiToFrequency(midi),
    velocity: clamp(0.1 + normalizedMagnitude * 0.34 + severity * 0.08, 0.1, 0.54),
    duration: clamp(event.persistence ?? 0.65 + normalizedMagnitude * 1.7 + severity * 2.4, 0.35, 5.8),
    cutoff: clamp(650 + event.confidence * 31 + normalizedMagnitude * 1150, 650, 4800),
    wet: clamp(0.19 + distance * 0.42 + severity * 0.13, 0.16, 0.72),
    delay: clamp((event.rtt ?? 86) / 1000, 0.055, 0.32),
    feedback: clamp(0.16 + (event.hops ?? 4) * 0.018 + severity * 0.07, 0.16, 0.44),
    pan: clamp((event.longitude ?? ((identity % 300) - 150)) / 180, -0.82, 0.82),
    roughness: clamp(severity * 0.68 + (100 - event.confidence) / 420, 0, 0.82),
  };
}

export function eventColor(event: SeaEvent) {
  if (event.severity === "outage") return "#ff405f";
  if (event.severity === "degraded") return "#ff8d6a";
  return SOURCE_COLORS[event.source];
}

export function eventExplanation(event: SeaEvent, mapping = mapEventToSound(event)) {
  const delayMs = Math.round(mapping.delay * 1000);
  const parts = [
    `${SOURCE_LABELS[event.source]} chooses the instrument`,
    `${event.kind.toLowerCase()} is held for ${mapping.duration.toFixed(1)} seconds`,
    `${event.confidence}% confidence opens the filter to ${Math.round(mapping.cutoff)} Hz`,
  ];
  if (typeof event.rtt === "number") parts.push(`${event.rtt.toFixed(1)} ms RTT becomes a ${delayMs} ms reflection`);
  if (typeof event.hops === "number") parts.push(`${event.hops} hops shape the echo density`);
  return parts.join(". ") + ".";
}
