import { NextResponse } from "next/server";

type HealthState = "operational" | "degraded" | "outage" | "unknown";

type ServiceHealth = {
  name: string;
  state: HealthState;
  description: string;
  incidents: number;
};

type StatusPageSummary = {
  status?: { indicator?: string; description?: string };
  components?: Array<{ status?: string }>;
  incidents?: Array<{ name?: string; impact?: string; status?: string }>;
};

function stateFromIndicator(indicator = "unknown"): HealthState {
  if (indicator === "none") return "operational";
  if (indicator === "minor") return "degraded";
  if (indicator === "major" || indicator === "critical") return "outage";
  return "unknown";
}

function riskForState(state: HealthState) {
  if (state === "outage") return 88;
  if (state === "degraded") return 46;
  return 0;
}

async function fetchStatusPage(name: string, url: string): Promise<ServiceHealth> {
  try {
    const response = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6500),
    });
    if (!response.ok) throw new Error("status unavailable");
    const data = (await response.json()) as StatusPageSummary;
    const state = stateFromIndicator(data.status?.indicator);
    return {
      name,
      state,
      description: data.status?.description ?? "Status available",
      incidents: Array.isArray(data.incidents) ? data.incidents.length : 0,
    };
  } catch {
    return { name, state: "unknown", description: "Monitor unavailable", incidents: 0 };
  }
}

async function fetchGoogleCloud(): Promise<ServiceHealth> {
  try {
    const response = await fetch("https://status.cloud.google.com/incidents.json", {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(6500),
    });
    if (!response.ok) throw new Error("status unavailable");
    const incidents = (await response.json()) as Array<{
      end?: string;
      severity?: string;
      status_impact?: string;
    }>;
    const active = incidents.filter((incident) => !incident.end);
    const critical = active.some((incident) =>
      /high|critical|outage/i.test(`${incident.severity ?? ""} ${incident.status_impact ?? ""}`),
    );
    return {
      name: "Google Cloud",
      state: critical ? "outage" : active.length ? "degraded" : "operational",
      description: active.length ? `${active.length} active incident${active.length === 1 ? "" : "s"}` : "All systems operational",
      incidents: active.length,
    };
  } catch {
    return { name: "Google Cloud", state: "unknown", description: "Monitor unavailable", incidents: 0 };
  }
}

async function queryRootResolver(url: string, headers: HeadersInit = {}) {
  try {
    const response = await fetch(url, { headers, signal: AbortSignal.timeout(5000) });
    if (!response.ok) return { available: false, names: [] as string[], dnssec: false };
    const data = (await response.json()) as {
      Status?: number;
      AD?: boolean;
      Answer?: Array<{ type?: number; data?: string }>;
    };
    const names = (data.Answer ?? [])
      .filter((answer) => answer.type === 2 && /root-servers\.net\.?$/i.test(answer.data ?? ""))
      .map((answer) => String(answer.data).toLowerCase());
    return { available: data.Status === 0, names, dnssec: Boolean(data.AD) };
  } catch {
    return { available: false, names: [] as string[], dnssec: false };
  }
}

async function fetchRootHealth() {
  const [google, cloudflare, operatorPage] = await Promise.all([
    queryRootResolver("https://dns.google/resolve?name=.&type=NS&do=1"),
    queryRootResolver("https://cloudflare-dns.com/dns-query?name=.&type=NS&do=1", {
      Accept: "application/dns-json",
    }),
    fetch("https://root-servers.org/", { signal: AbortSignal.timeout(6500) })
      .then((response) => (response.ok ? response.text() : ""))
      .catch(() => ""),
  ]);
  const names = new Set([...google.names, ...cloudflare.names]);
  const resolverCount = Number(google.available) + Number(cloudflare.available);
  const instancesMatch = operatorPage.match(/consists of\s+([\d,]+)\s+operational instances/i);
  const operatorOperational = /Status:\s*operational/i.test(operatorPage);
  const state: HealthState =
    names.size >= 13 && resolverCount === 2 && operatorOperational
      ? "operational"
      : names.size >= 13 && resolverCount >= 1
        ? "degraded"
        : resolverCount === 0
          ? "unknown"
          : "outage";
  return {
    state,
    resolvedIdentities: names.size,
    resolversResponding: resolverCount,
    dnssecValidated: google.dnssec || cloudflare.dnssec,
    operationalInstances: instancesMatch ? Number(instancesMatch[1].replaceAll(",", "")) : null,
    description:
      state === "operational"
        ? "Root system operational"
        : state === "unknown"
          ? "Root monitors unavailable"
          : `${names.size}/13 root identities observed`,
  };
}

export async function GET() {
  const [cloudflare, github, fastly, googleCloud, root] = await Promise.all([
    fetchStatusPage("Cloudflare", "https://www.cloudflarestatus.com/api/v2/summary.json"),
    fetchStatusPage("GitHub", "https://www.githubstatus.com/api/v2/summary.json"),
    fetchStatusPage("Fastly", "https://www.fastlystatus.com/api/v2/summary.json"),
    fetchGoogleCloud(),
    fetchRootHealth(),
  ] as const);
  const services = [cloudflare, github, fastly, googleCloud];
  const knownStates = services.filter((service) => service.state !== "unknown");
  const serviceRisk = knownStates.reduce((highest, service) => Math.max(highest, riskForState(service.state)), 0);
  const incidentPressure = Math.min(
    18,
    services.reduce((total, service) => total + service.incidents, 0) * 4,
  );
  const rootRisk = root.state === "outage" ? 100 : root.state === "degraded" ? 38 : 0;
  const risk = Math.min(100, Math.max(serviceRisk, rootRisk) + incidentPressure);
  const state: HealthState =
    risk >= 72 ? "outage" : risk >= 28 ? "degraded" : knownStates.length ? "operational" : "unknown";

  return NextResponse.json(
    {
      generatedAt: new Date().toISOString(),
      state,
      risk,
      root,
      services,
      monitorCoverage: `${knownStates.length + (root.state === "unknown" ? 0 : 1)}/5`,
    },
    {
      headers: {
        "Cache-Control": "public, max-age=30, s-maxage=60, stale-while-revalidate=120",
      },
    },
  );
}
