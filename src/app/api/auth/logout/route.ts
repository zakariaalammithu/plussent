// POST /api/auth/logout — destroy the current session + clear the cookie.
import { NextResponse, type NextRequest } from "next/server";
import { clearSessionCookie, destroySession, SESSION_COOKIE } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) await destroySession(token);
  const res = NextResponse.json({ ok: true });
  return clearSessionCookie(res);
}
