import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { cache } from "react";
import { obterSegredoJwt } from "./segredo";

const NOME_COOKIE_SESSAO = "chamados_unopar_session";
const DURACAO_SESSAO_SEGUNDOS = 8 * 60 * 60; // 8 horas

export interface PayloadSessao {
  id: string;
  email: string;
  nome_completo: string;
  papel: "admin" | "coordenador" | "atendente";
  polo_id?: string | null;
  polo_nome?: string | null;
}

/**
 * Cria o JWT assinado com validade de 8 horas e define o cookie HTTP-only seguro.
 */
export async function criarSessao(payload: PayloadSessao): Promise<string> {
  const jwt = await new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_SESSAO_SEGUNDOS}s`)
    .sign(obterSegredoJwt());

  const cookieStore = await cookies();
  cookieStore.set(NOME_COOKIE_SESSAO, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DURACAO_SESSAO_SEGUNDOS,
  });

  return jwt;
}

/**
 * Valida diretamente uma string de token JWT.
 */
export async function verificarToken(token?: string | null): Promise<PayloadSessao | null> {
  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, obterSegredoJwt());
    return payload as unknown as PayloadSessao;
  } catch {
    return null;
  }
}

/**
 * Verifica o token JWT da sessão atual via cookie store ou token explícito.
 */
export const verificarSessao = cache(async (tokenOpt?: string): Promise<PayloadSessao | null> => {
  if (tokenOpt) {
    return verificarToken(tokenOpt);
  }

  try {
    const cookieStore = await cookies();
    const token = cookieStore.get(NOME_COOKIE_SESSAO)?.value;
    return verificarToken(token);
  } catch {
    return null;
  }
});

/**
 * Destrói o cookie de sessão para logout com garantia de expiração no path raiz.
 */
export async function destruirSessao(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(NOME_COOKIE_SESSAO, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
    expires: new Date(0),
  });
  cookieStore.delete(NOME_COOKIE_SESSAO);
}
