import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getPool, sql } from "@/lib/db/pool";

export interface PerfilAgente {
  id: string;
  nome_completo: string;
  papel: "admin" | "coordenador" | "atendente";
  polo_id: string | null;
}

function tokensIguais(recebido: string, esperado: string): boolean {
  const a = crypto.createHash("sha256").update(recebido).digest();
  const b = crypto.createHash("sha256").update(esperado).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Autentica chamadas do agente (Prisma) por token Bearer.
 * O agente age como um perfil real de dados.perfis (AGENTE_PERFIL_ID), então RLS,
 * auditoria e "criado_por/atualizado_por" registram o agente como autor.
 */
export async function autenticarAgente(
  request: NextRequest
): Promise<{ perfil: PerfilAgente } | { resposta: NextResponse }> {
  const tokenEsperado = process.env.AGENTE_API_TOKEN?.trim();
  const perfilId = process.env.AGENTE_PERFIL_ID?.trim();

  if (!tokenEsperado || tokenEsperado.length < 32 || !perfilId) {
    return {
      resposta: NextResponse.json({ erro: "API do agente desativada." }, { status: 503 }),
    };
  }

  const cabecalho = request.headers.get("authorization") || "";
  const token = cabecalho.startsWith("Bearer ") ? cabecalho.slice(7).trim() : "";

  if (!token || !tokensIguais(token, tokenEsperado)) {
    return { resposta: NextResponse.json({ erro: "Não autorizado." }, { status: 401 }) };
  }

  const pool = await getPool();
  const res = await pool.request().input("id", sql.VarChar(50), perfilId).query(`
      SELECT
        CAST(id AS NVARCHAR(50)) AS id,
        nome_completo,
        papel,
        ativo,
        CAST(polo_id AS NVARCHAR(50)) AS polo_id
      FROM dados.perfis
      WHERE id = @id
    `);

  const perfil = res.recordset[0];
  if (!perfil || !perfil.ativo) {
    return {
      resposta: NextResponse.json({ erro: "Perfil do agente inativo." }, { status: 403 }),
    };
  }

  return {
    perfil: {
      id: perfil.id,
      nome_completo: perfil.nome_completo,
      papel: perfil.papel,
      polo_id: perfil.polo_id || null,
    },
  };
}

/**
 * Prazo padrão de 5 dias úteis (mesma regra do formulário, sem feriados).
 */
export function calcularPrazo5DiasUteis(dataSolicitacao: string): string {
  const data = new Date(`${dataSolicitacao}T12:00:00Z`);
  let diasUteis = 0;
  while (diasUteis < 5) {
    data.setUTCDate(data.getUTCDate() + 1);
    const diaSemana = data.getUTCDay();
    if (diaSemana !== 0 && diaSemana !== 6) diasUteis++;
  }
  return data.toISOString().slice(0, 10);
}

export function hojeEmBelem(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Belem" }).format(new Date());
}
