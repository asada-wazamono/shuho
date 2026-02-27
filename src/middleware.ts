import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const SESSION_COOKIE = "session";

export function middleware(request: NextRequest) {
  // Basic認証（環境変数が設定されている場合のみ有効 / Vercel限定公開用）
  const basicUser = process.env.BASIC_AUTH_USER;
  const basicPassword = process.env.BASIC_AUTH_PASSWORD;
  if (basicUser && basicPassword) {
    const auth = request.headers.get("authorization");
    const isValid = (() => {
      if (!auth?.startsWith("Basic ")) return false;
      try {
        const [user, pass] = atob(auth.slice(6)).split(":");
        return user === basicUser && pass === basicPassword;
      } catch {
        return false;
      }
    })();
    if (!isValid) {
      return new NextResponse("Unauthorized", {
        status: 401,
        headers: { "WWW-Authenticate": 'Basic realm="Secure Area"' },
      });
    }
  }

  const pathname = request.nextUrl.pathname;

  if (pathname.startsWith("/api") || pathname.startsWith("/_next") || pathname.includes(".")) {
    return NextResponse.next();
  }

  const hasSession = !!request.cookies.get(SESSION_COOKIE)?.value;

  if (pathname === "/login") {
    if (hasSession) return NextResponse.redirect(new URL("/", request.url));
    return NextResponse.next();
  }

  if (!hasSession) {
    const login = new URL("/login", request.url);
    login.searchParams.set("from", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
