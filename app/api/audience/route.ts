import { NextResponse } from "next/server";

import { APP_VERSION } from "../../app-version";

type AudienceSession = {
  seenAt: number;
  listening: boolean;
};

const SESSION_TTL_MS = 45_000;
const MAX_SESSIONS = 5_000;
const sessions = new Map<string, AudienceSession>();
const sessionPattern = /^[a-f0-9-]{20,64}$/i;

function pruneSessions(now = Date.now()) {
  for (const [sessionId, session] of sessions) {
    if (now - session.seenAt > SESSION_TTL_MS) sessions.delete(sessionId);
  }
}

function snapshot() {
  pruneSessions();
  return {
    visitors: sessions.size,
    listeners: [...sessions.values()].filter((session) => session.listening).length,
    version: APP_VERSION,
    ephemeral: true,
    expiresInSeconds: SESSION_TTL_MS / 1000,
  };
}

function response() {
  return NextResponse.json(snapshot(), {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}

export async function GET() {
  return response();
}

export async function POST(request: Request) {
  let payload: { sessionId?: unknown; listening?: unknown };
  try {
    payload = (await request.json()) as typeof payload;
  } catch {
    return NextResponse.json({ error: "Invalid heartbeat" }, { status: 400 });
  }

  if (typeof payload.sessionId !== "string" || !sessionPattern.test(payload.sessionId)) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }

  const now = Date.now();
  pruneSessions(now);
  if (!sessions.has(payload.sessionId) && sessions.size >= MAX_SESSIONS) {
    return NextResponse.json({ error: "Audience capacity reached" }, { status: 503 });
  }
  sessions.set(payload.sessionId, {
    seenAt: now,
    listening: payload.listening === true,
  });
  return response();
}

export async function DELETE(request: Request) {
  try {
    const payload = (await request.json()) as { sessionId?: unknown };
    if (typeof payload.sessionId === "string" && sessionPattern.test(payload.sessionId)) {
      sessions.delete(payload.sessionId);
    }
  } catch {
    // Expiration still removes an interrupted or malformed departure.
  }
  return response();
}
