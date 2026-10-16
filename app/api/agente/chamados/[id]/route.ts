import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { autenticarAgente } from "@/lib/agente/auth";
import { comTransacao } from "@/lib/db/comUsuario";
import { sql } from "@/lib/db/pool";

export const dynamic = "force-dynamic";

interface Params {
  params: Promise<{ id: string }>;
}

const atualizarSchema = z
  .object({
    // Protocolo do PAD (C…/CS…) gravado após a abertura no PAD
    protocolo: z
      .string()
      .trim()
      .regex(/^(CS\d{8}|CS\d{8}-\d{4}|C\d{6,14}|[A-Za-z0-9\-]{5,20})$/, "Protocolo inválido.")
      .optional(),
    situacao: z.enum(["rascunho", "aguardando", "concluido", "encerrado"] as const).optional(),
    // Texto acrescentado ao fim da observação (ex.: "PAD: status Em andamento — resposta …")
    observacao_adicionar: z.string().trim().min(1).max(4000).optional(),
  })
  .refine((d) => d.protocolo || d.situacao || d.observacao_adicionar, "Nada para atualizar.");

/**
 * PATCH /api/agente/chamados/:id
 * Atualização pelo agente: protocolo do PAD, situação e registro do andamento na observação.
 * Não altera dados do aluno, motivo ou prazo.
 */
export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const auth = await autenticarAgente(request);
    if ("resposta" in auth) return auth.resposta;
    const { perfil } = auth;

    const { id } = await params;
    if (!z.string().uuid().safeParse(id).success) {
      return NextResponse.json({ erro: "ID inválido." }, { status: 400 });
    }

    const corpo = await request.json().catch(() => null);
    const parse = atualizarSchema.safeParse(corpo);
    if (!parse.success) {
      return NextResponse.json(
        { erro: "Dados inválidos.", detalhes: parse.error.flatten() },
        { status: 400 }
      );
    }
    const dados = parse.data;
    const protocolo = dados.protocolo?.toUpperCase() || null;

    const resultado = await comTransacao(
      { usuario_id: perfil.id, papel: perfil.papel },
      async (req) => {
        if (protocolo) {
          const dup = await req
            .input("protocolo_dup", sql.VarChar(30), protocolo)
            .input("id_dup", sql.VarChar(50), id)
            .query(
              `SELECT 1 AS existe FROM dados.chamados WHERE protocolo = @protocolo_dup AND id != @id_dup AND excluido_em IS NULL`
            );
          if (dup.recordset[0]) return "duplicado" as const;
          req.parameters = {};
        }

        const carimbo = new Intl.DateTimeFormat("pt-BR", {
          timeZone: "America/Belem",
          dateStyle: "short",
          timeStyle: "short",
        }).format(new Date());
        const linhaObservacao = dados.observacao_adicionar
          ? `[${carimbo} · ${perfil.nome_completo}] ${dados.observacao_adicionar}`
          : null;

        const q = await req
          .input("id", sql.VarChar(50), id)
          .input("protocolo", sql.VarChar(20), protocolo)
          .input("situacao", sql.VarChar(20), dados.situacao || null)
          .input("linha_observacao", sql.NVarChar(sql.MAX), linhaObservacao)
          .input("atualizado_por", sql.VarChar(50), perfil.id)
          .input("atualizado_por_nome", sql.NVarChar(200), perfil.nome_completo.slice(0, 200))
          .query(`
            UPDATE dados.chamados
            SET
              protocolo = COALESCE(@protocolo, protocolo),
              situacao = COALESCE(@situacao, situacao),
              data_conclusao = CASE
                WHEN @situacao IN ('concluido', 'encerrado') AND data_conclusao IS NULL THEN SYSDATETIMEOFFSET()
                WHEN @situacao IN ('rascunho', 'aguardando') THEN NULL
                ELSE data_conclusao
              END,
              observacao = CASE
                WHEN @linha_observacao IS NULL THEN observacao
                WHEN observacao IS NULL OR LTRIM(RTRIM(observacao)) = '' THEN @linha_observacao
                ELSE observacao + CHAR(10) + @linha_observacao
              END,
              atualizado_por = @atualizado_por,
              atualizado_por_nome = @atualizado_por_nome,
              atualizado_em = SYSUTCDATETIME()
            WHERE id = @id AND excluido_em IS NULL;

            SELECT @@ROWCOUNT AS afetados;
          `);

        return q.recordset[0]?.afetados > 0 ? ("ok" as const) : ("nao_encontrado" as const);
      }
    );

    if (resultado === "duplicado") {
      return NextResponse.json({ erro: "Protocolo já usado em outro chamado." }, { status: 409 });
    }
    if (resultado === "nao_encontrado") {
      return NextResponse.json({ erro: "Chamado não encontrado." }, { status: 404 });
    }

    return NextResponse.json({ sucesso: true });
  } catch (error) {
    console.error("[ERRO_API_AGENTE_ATUALIZAR]:", error);
    return NextResponse.json({ erro: "Erro ao atualizar chamado." }, { status: 500 });
  }
}
