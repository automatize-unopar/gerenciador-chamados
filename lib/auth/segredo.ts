const SEGREDO_DEV = "chave-secreta-padrao-minimo-32-caracteres-para-dev";

/**
 * Retorna a chave de assinatura do JWT de sessão.
 * Em produção exige AUTH_SECRET (mínimo 32 caracteres); nunca usa a chave de desenvolvimento,
 * que é pública no repositório e permitiria forjar sessões.
 */
export function obterSegredoJwt(): Uint8Array {
  const segredo = process.env.AUTH_SECRET?.trim();

  if (segredo && segredo.length >= 32) {
    return new TextEncoder().encode(segredo);
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("AUTH_SECRET ausente ou com menos de 32 caracteres em produção.");
  }

  return new TextEncoder().encode(SEGREDO_DEV);
}
