import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { autenticarAgente, calcularPrazo5DiasUteis, hojeEmBelem } from "@/lib/agente/auth";
import { comUsuario, comTransacao } from "@/lib/db/comUsuario";
import { sql } from "@/lib/db/pool";
import { limparCpf, validarCpf } from "@/lib/utils/cpf";

export const dynamic = "force-dynamic";

const SITUACOES = ["rascunho", "aguardando", "concluido", "encerrado"] as const;

/**
 * GET /api/agente/chamados?situacao=rascunho&limite=50
 * Lista chamados para o agente: "rascunho" = fila para enviar ao PAD;
 * "aguardando" = já enviados, para acompanhar o andamento no PAD.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await autenticarAgente(request);
    if ("resposta" in auth) return auth.resposta;
    const { perfil } = auth;

    const situacao = request.nextUrl.searchParams.get("situacao") || "rascunho";
    if (!(SITUACOES as readonly string[]).includes(situacao)) {
      return NextResponse.json({ erro: "Situação inválida." }, { status: 400 });
    }
    const limite = Math.min(
      Math.max(parseInt(request.nextUrl.searchParams.get("limite") || "50", 10) || 50, 1),
      200
    );

    const chamados = await comUsuario({ usuario_id: perfil.id, papel: perfil.papel }, async (req) => {
      const q = await req
        .input("situacao", sql.VarChar(20), situacao)
        .input("limite", sql.Int, limite).query(`
          SELECT TOP (@limite)
            CAST(c.id AS NVARCHAR(50)) AS id,
            c.protocolo,
            c.aluno_nome,
            c.aluno_ra,
            c.aluno_cpf,
            c.contato_telefone,
            CAST(c.polo_id AS NVARCHAR(50)) AS polo_id,
            pol.nome AS polo_nome,
            CAST(c.motivo_id AS NVARCHAR(50)) AS motivo_id,
            m.codigo AS motivo_codigo,
            m.nome AS motivo_nome,
            m.filtro AS motivo_filtro,
            c.descricao,
            c.observacao,
            c.situacao,
            c.prioridade,
            c.data_solicitacao,
            c.prazo,
            c.criado_por_nome,
            c.atualizado_em
          FROM dados.chamados c
          INNER JOIN dados.motivos m ON m.id = c.motivo_id
          LEFT JOIN dados.polos pol ON pol.id = c.polo_id
          WHERE c.situacao = @situacao AND c.excluido_em IS NULL
          ORDER BY c.data_solicitacao ASC, c.criado_em ASC
        `);
      return q.recordset;
    });

    return NextResponse.json({ chamados });
  } catch (error) {
    console.error("[ERRO_API_AGENTE_LISTAR]:", error);
    return NextResponse.json({ erro: "Erro ao listar chamados." }, { status: 500 });
  }
}

const criarSchema = z.object({
  protocolo: z
    .string()
    .trim()
    .regex(/^(CS\d{8}|CS\d{8}-\d{4}|C\d{6,14}|[A-Za-z0-9\-]{5,20})$/, "Protocolo inválido.")
    .optional()
    .nullable(),
  aluno_nome: z.string().trim().min(3).max(200),
  aluno_ra: z.string().trim().max(50).optional().nullable(),
  aluno_cpf: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((val) => !val || validarCpf(limparCpf(val)), "CPF inválido.")
    .transform((val) => (val ? limparCpf(val) : null)),
  contato_telefone: z
    .string()
    .trim()
    .max(20)
    .optional()
    .nullable()
    .transform((val) => (val ? val.replace(/[^\d+()\-\s]/g, "").slice(0, 20) : null)),
  polo_id: z.string().uuid(),
  motivo_id: z.string().uuid(),
  descricao: z.string().trim().min(1),
  situacao: z.enum(["rascunho", "aguardando"] as const).default("rascunho"),
  prioridade: z.enum(["normal", "priorizar"] as const).default("normal"),
  data_solicitacao: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  observacao: z.string().trim().optional().nullable(),
});

/**
 * POST /api/agente/chamados
 * Cria um chamado no livro em nome do agente (ex.: triagem de conversa do WhatsApp).
 * Padrão: situação "rascunho" (aguardando conferência/envio ao PAD).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await autenticarAgente(request);
    if ("resposta" in auth) return auth.resposta;
    const { perfil } = auth;

    const corpo = await request.json().catch(() => null);
    const parse = criarSchema.safeParse(corpo);
    if (!parse.success) {
      return NextResponse.json(
        { erro: "Dados inválidos.", detalhes: parse.error.flatten().fieldErrors },
        { status: 400 }
      );
    }
    const dados = parse.data;
    const dataSolicitacao = dados.data_solicitacao || hojeEmBelem();
    const prazo = calcularPrazo5DiasUteis(dataSolicitacao);
    const sessao = { usuario_id: perfil.id, papel: perfil.papel };

    const resultado = await comTransacao(sessao, async (req) => {
      let protocolo = dados.protocolo?.toUpperCase() || null;

      if (protocolo) {
        const dup = await req
          .input("protocolo_dup", sql.VarChar(30), protocolo)
          .query(
            `SELECT CAST(id AS NVARCHAR(50)) AS id FROM dados.chamados WHERE protocolo = @protocolo_dup AND excluido_em IS NULL`
          );
        if (dup.recordset[0]) {
          return { duplicadoId: dup.recordset[0].id as string };
        }
      } else {
        const gerado = await req
          .input("data_solicitacao", sql.Date, new Date(dataSolicitacao))
          .output("protocolo_gerado", sql.VarChar(20))
          .execute("dados.gerar_protocolo");
        protocolo = gerado.output.protocolo_gerado as string;
      }

      req.parameters = {};
      const q = await req
        .input("protocolo", sql.VarChar(20), protocolo!.slice(0, 20))
        .input("aluno_nome", sql.NVarChar(200), dados.aluno_nome)
        .input("aluno_ra", sql.VarChar(50), dados.aluno_ra || null)
        .input("aluno_cpf", sql.VarChar(11), dados.aluno_cpf)
        .input("polo_id", sql.VarChar(50), dados.polo_id)
        .input("contato_telefone", sql.VarChar(20), dados.contato_telefone)
        .input("motivo_id", sql.VarChar(50), dados.motivo_id)
        .input("descricao", sql.NVarChar(sql.MAX), dados.descricao)
        .input("situacao", sql.VarChar(20), dados.situacao)
        .input("prioridade", sql.VarChar(20), dados.prioridade)
        .input("data_solicitacao", sql.Date, new Date(dataSolicitacao))
        .input("prazo", sql.Date, new Date(prazo))
        .input("observacao", sql.NVarChar(sql.MAX), dados.observacao || null)
        .input("criado_por", sql.VarChar(50), perfil.id)
        .input("criado_por_nome", sql.NVarChar(200), perfil.nome_completo.slice(0, 200)).query(`
          DECLARE @out TABLE (id UNIQUEIDENTIFIER);

          INSERT INTO dados.chamados (
            protocolo, aluno_nome, aluno_ra, aluno_cpf, polo_id, contato_telefone,
            motivo_id, descricao, situacao, prioridade, data_solicitacao, prazo,
            observacao, criado_por, criado_por_nome
          )
          OUTPUT inserted.id INTO @out(id)
          VALUES (
            @protocolo, @aluno_nome, @aluno_ra, @aluno_cpf, @polo_id, @contato_telefone,
            @motivo_id, @descricao, @situacao, @prioridade, @data_solicitacao, @prazo,
            @observacao, @criado_por, @criado_por_nome
          );

          SELECT CAST(id AS NVARCHAR(50)) AS id FROM @out;
        `);

      return { id: q.recordset[0]?.id as string, protocolo };
    });

    if ("duplicadoId" in resultado) {
      return NextResponse.json(
        { erro: "Protocolo já cadastrado.", chamadoId: resultado.duplicadoId },
        { status: 409 }
      );
    }

    return NextResponse.json({ chamadoId: resultado.id, protocolo: resultado.protocolo, prazo }, { status: 201 });
  } catch (error) {
    console.error("[ERRO_API_AGENTE_CRIAR]:", error);
    return NextResponse.json({ erro: "Erro ao criar chamado." }, { status: 500 });
  }
}
