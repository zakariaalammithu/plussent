// PlaseSent middleware — route protection.
// Redirects to /login when the ps_session cookie is absent on protected
// routes. NOTE: middleware runs in the Edge runtime and cannot query the
// libSQL database, so it checks cookie PRESENCE only. Every API route and
// server action re-validates the session against the DB (see lib/auth.ts);
// a forged or expired cookie gets a 401 there.
import { NextResponse, type NextRequest } from "next/server";

// Keep in sync with SESSION_COOKIE in lib/auth.ts. Middleware runs in the
// Edge runtime and cannot import Node-only modules (bcryptjs, libSQL), so
// the cookie name is duplicated here deliberately.
const SESSION_COOKIE = "ps_session";

const PROTECTED_PREFIXES = ["/dashboard", "/leads", "/campaigns", "/inbox", "/settings", "/admin"];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (!isProtected) return NextResponse.next();
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (token) return NextResponse.next();
  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/dashboard/:path*", "/leads/:path*", "/campaigns/:path*", "/inbox/:path*", "/settings/:path*", "/admin/:path*"],
};
