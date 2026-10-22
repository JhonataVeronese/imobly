import { shouldUseSecureCookie } from "@/lib/auth/cookie";
import { SESSION_COOKIE } from "@/lib/auth/jwt";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const secure = shouldUseSecureCookie(request.url);

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}
