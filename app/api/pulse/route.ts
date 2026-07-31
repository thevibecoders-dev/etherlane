import { NextResponse } from "next/server";

type Publication = {
  id: string;
  source: string;
  publishedAt: string | null;
  ageMinutes: number | null;
};

const FEEDS = [
  { source: "RIPE Labs", url: "https://labs.ripe.net/rss/" },
  { source: "APNIC Blog", url: "https://blog.apnic.net/feed/" },
  { source: "Cloudflare Blog", url: "https://blog.cloudflare.com/rss/" },
];

function textBetween(xml: string, tags: string[]) {
  for (const tag of tags) {
    const match = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>(?:<!\\[CDATA\\[)?([\\s\\S]*?)(?:\\]\\]>)?<\\/${tag}>`, "i"));
    if (match?.[1]) return match[1].trim();
  }
  return "";
}

function stableId(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

async function fetchPublication(feed: (typeof FEEDS)[number]): Promise<Publication | null> {
  try {
    const response = await fetch(feed.url, {
      headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(6500),
    });
    if (!response.ok) return null;
    const xml = await response.text();
    const item = xml.match(/<(?:item|entry)(?:\s[^>]*)?>[\s\S]*?<\/(?:item|entry)>/i)?.[0] ?? "";
    if (!item) return null;
    const identity = textBetween(item, ["guid", "id", "link", "title"]);
    const publishedRaw = textBetween(item, ["pubDate", "published", "updated", "dc:date"]);
    const parsed = publishedRaw ? Date.parse(publishedRaw) : Number.NaN;
    const publishedAt = Number.isFinite(parsed) ? new Date(parsed).toISOString() : null;
    const ageMinutes = Number.isFinite(parsed) ? Math.max(0, Math.round((Date.now() - parsed) / 60_000)) : null;
    return {
      id: stableId(`${feed.source}:${identity}`),
      source: feed.source,
      publishedAt,
      ageMinutes,
    };
  } catch {
    return null;
  }
}

function findArrays(value: unknown, arrays: unknown[][] = []): unknown[][] {
  if (Array.isArray(value)) {
    arrays.push(value);
    value.slice(0, 12).forEach((item) => findArrays(item, arrays));
  } else if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).slice(0, 24).forEach((item) => findArrays(item, arrays));
  }
  return arrays;
}

async function fetchIoda() {
  try {
    const response = await fetch("https://api.ioda.inetintel.cc.gatech.edu/v2/outages/alerts", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(7000),
    });
    if (!response.ok) throw new Error("IODA unavailable");
    const body = (await response.json()) as unknown;
    const candidate = findArrays(body).sort((left, right) => right.length - left.length)[0] ?? [];
    const active = candidate.filter((item) => {
      if (!item || typeof item !== "object") return false;
      const record = item as Record<string, unknown>;
      const text = `${record.status ?? ""} ${record.level ?? ""} ${record.severity ?? ""}`.toLowerCase();
      return !/closed|resolved|inactive|ended/.test(text);
    }).length;
    return {
      available: true,
      active,
      severity: active >= 8 ? "outage" : active > 0 ? "degraded" : "nominal",
      label: active > 0 ? "IODA observed Internet reachability disruption" : "No active IODA alerts observed",
    } as const;
  } catch {
    return {
      available: false,
      active: 0,
      severity: "nominal",
      label: "IODA monitor unavailable",
    } as const;
  }
}

export async function GET() {
  const [outage, ...publicationResults] = await Promise.all([
    fetchIoda(),
    ...FEEDS.map((feed) => fetchPublication(feed)),
  ]);
  const publications = publicationResults.filter((item): item is Publication => item !== null);
  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      outage,
      publications,
      retention: "none",
    },
    {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=180",
        "X-Etherlane-Retention": "none",
      },
    },
  );
}
