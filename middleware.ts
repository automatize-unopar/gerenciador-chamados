import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { obterSegredoJwt } from "@/lib/auth/segredo";

const NOME_COOKIE_SESSAO = "chamados_unopar_session";

export async function middleware(request: NextRequest) {
  const token = request.cookies.get(NOME_COOKIE_SESSAO)?.value;
  let usuarioAutenticado = false;

  if (token) {
    try {
      await jwtVerify(token, obterSegredoJwt());
      usuarioAutenticado = true;
    } catch {
      usuarioAutenticado = false;
    }
  }

  const ehRotaLogin = request.nextUrl.pathname === "/login";
  const ehRotaPublica =
    ehRotaLogin ||
    request.nextUrl.pathname.startsWith("/_next") ||
    request.nextUrl.pathname.startsWith("/api/public") ||
    // API do agente: autenticada por token Bearer na própria rota (lib/agente/auth.ts)
    request.nextUrl.pathname.startsWith("/api/agente/") ||
    request.nextUrl.pathname === "/favicon.ico" ||
    request.nextUrl.pathname === "/logo.png";

  if (!usuarioAutenticado && !ehRotaPublica) {
    const urlLogin = request.nextUrl.clone();
    urlLogin.pathname = "/login";
    return NextResponse.redirect(urlLogin);
  }

  if (usuarioAutenticado && ehRotaLogin) {
    const urlPainel = request.nextUrl.clone();
    urlPainel.pathname = "/painel";
    return NextResponse.redirect(urlPainel);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
