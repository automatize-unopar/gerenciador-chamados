"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { obterPerfilAtual } from "@/lib/auth/perfil";
import { comUsuario, comTransacao } from "@/lib/db/comUsuario";
import { getPool, sql } from "@/lib/db/pool";
import { salvarArquivoLocal } from "@/lib/storage/anexos";
import { limparCpf, validarCpf } from "@/lib/utils/cpf";
import { SITUACOES_CHAMADO } from "@/lib/chamados/situacao";

const chamadoSchema = z.object({
  protocolo: z
    .string()
    .trim()
    .max(20, "O protocolo deve ter no máximo 20 caracteres.")
    .regex(
      /^(CS\d{8}|CS\d{8}-\d{4}|C\d{6,14}|[A-Za-z0-9\-]{5,20})$/,
      "Protocolo inválido. Informe o código do PAD (ex: C345235256) ou deixe em branco para gerar automaticamente."
    )
    .optional()
    .nullable()
    .or(z.literal("")),
  aluno_nome: z
    .string()
    .trim()
    .min(3, "Informe o nome completo do aluno.")
    .max(200, "O nome do aluno deve ter no máximo 200 caracteres."),
  aluno_ra: z
    .string()
    .trim()
    .max(50, "O RA deve ter no máximo 50 caracteres.")
    .optional()
    .nullable(),
  aluno_cpf: z
    .string()
    .trim()
    .optional()
    .nullable()
    .superRefine((val, ctx) => {
      if (!val) return;
      const limpo = limparCpf(val);
      if (limpo.length > 0 && !validarCpf(limpo)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "CPF inválido. Verifique os dígitos informados ou deixe o campo em branco.",
        });
      }
    })
    .transform((val) => {
      if (!val) return null;
      const limpo = limparCpf(val);
      return limpo.length === 11 ? limpo : null;
    }),
  polo_id: z.string().uuid("Selecione um polo válido.").optional().nullable().or(z.literal("")),
  contato_telefone: z
    .string()
    .trim()
    .max(20, "O telefone deve ter no máximo 20 caracteres.")
    .optional()
    .nullable()
    .transform((val) => (val ? val.replace(/[^\d+()\-\s]/g, "").slice(0, 20) : null)),
  motivo_id: z.string().uuid("Selecione um motivo válido do catálogo."),
  descricao: z.string().trim().min(1, "A descrição do chamado é obrigatória."),
  situacao: z.enum(SITUACOES_CHAMADO),
  prioridade: z.enum(["normal", "priorizar"] as const),
  data_solicitacao: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de solicitação inválida."),
  prazo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data de prazo inválida."),
  chamado_vinculado_id: z.string().uuid().optional().nullable().or(z.literal("")),
  observacao: z.string().trim().optional().nullable(),
});

export type EstadoSalvarChamado = {
  sucesso?: boolean;
  chamadoId?: string;
  erro?: string;
  errosCampo?: Record<string, string>;
};

/**
 * Gera atomicamente o próximo protocolo sequencial do dia chamando a procedure dados.gerar_protocolo.
 */
export async function gerarProximoProtocolo(dataSolicitacaoStr?: string): Promise<string> {
  const dataRef = dataSolicitacaoStr ? new Date(dataSolicitacaoStr) : new Date();
  const perfil = await obterPerfilAtual();

  return await comUsuario({ usuario_id: perfil.id, papel: perfil.papel }, async (req) => {
    const res = await req
      .input("data_solicitacao", sql.Date, dataRef)
      .output("protocolo_gerado", sql.VarChar(20))
      .execute("dados.gerar_protocolo");

    return res.output.protocolo_gerado;
  });
}

export async function verificarProtocoloDuplicado(protocolo: string, chamadoAtualId?: string) {
  const limpo = protocolo.trim().toUpperCase();
  if (limpo.length < 5) {
    return null;
  }

  const perfil = await obterPerfilAtual();

  return await comUsuario({ usuario_id: perfil.id, papel: perfil.papel }, async (req) => {
    let sqlQuery = `
        SELECT 
          CAST(id AS NVARCHAR(50)) AS id,
          protocolo,
          criado_em,
          CAST(criado_por AS NVARCHAR(50)) AS criado_por,
          criado_por_nome
        FROM dados.chamados
        WHERE protocolo = @protocolo AND excluido_em IS NULL
      `;

    req.input("protocolo", sql.VarChar(30), limpo);

    if (chamadoAtualId) {
      req.input("atualId", sql.VarChar(50), chamadoAtualId);
      sqlQuery += ` AND id != @atualId`;
    }

    const q = await req.query(sqlQuery);
    const data = q.recordset[0];

    if (!data) return null;

    return {
      duplicado: true,
      protocolo: data.protocolo,
      criado_em: data.criado_em,
      criado_por_nome: data.criado_por_nome || "Usuário do sistema",
    };
  });
}

export async function buscarChamadosParaVinculo(termo: string) {
  if (!termo || termo.trim().length < 2) return [];

  const perfil = await obterPerfilAtual();
  const busca = termo.trim();

  return await comUsuario({ usuario_id: perfil.id, papel: perfil.papel }, async (req) => {
    req.input("termoBusca", sql.VarChar(255), `%${busca}%`);
    req.input("termoPrefixo", sql.VarChar(50), `${busca}%`);

    const q = await req.query(`
        SELECT TOP 10
          CAST(c.id AS NVARCHAR(50)) AS id,
          c.protocolo,
          c.aluno_nome,
          c.aluno_ra,
          c.aluno_cpf,
          CAST(c.polo_id AS NVARCHAR(50)) AS polo_id,
          pol.nome AS polo_nome,
          c.data_solicitacao,
          c.situacao
        FROM dados.chamados c
        LEFT JOIN dados.polos pol ON pol.id = c.polo_id
        WHERE c.excluido_em IS NULL
          AND (c.protocolo LIKE @termoPrefixo OR c.aluno_nome LIKE @termoBusca OR c.aluno_ra LIKE @termoBusca)
        ORDER BY c.data_solicitacao DESC
      `);

    return q.recordset;
  });
}

export async function salvarChamado(
  _estadoAnterior: EstadoSalvarChamado,
  formData: FormData
): Promise<EstadoSalvarChamado> {
  const perfil = await obterPerfilAtual();
  const chamadoId = formData.get("id") ? String(formData.get("id")) : undefined;

  const dadosBrutos = {
    protocolo: formData.get("protocolo") || null,
    aluno_nome: formData.get("aluno_nome"),
    aluno_ra: formData.get("aluno_ra") || null,
    aluno_cpf: formData.get("aluno_cpf") || null,
    polo_id: formData.get("polo_id") || perfil.polo_id || null,
    contato_telefone: formData.get("contato_telefone") || null,
    motivo_id: formData.get("motivo_id"),
    descricao: formData.get("descricao") || null,
    situacao: formData.get("situacao") || "aguardando",
    prioridade: formData.get("prioridade") || "normal",
    data_solicitacao: formData.get("data_solicitacao"),
    prazo: formData.get("prazo"),
    chamado_vinculado_id: formData.get("chamado_vinculado_id") || null,
    observacao: formData.get("observacao") || null,
  };

  const parseResult = chamadoSchema.safeParse(dadosBrutos);
  if (!parseResult.success) {
    const errosCampo: Record<string, string> = {};
    for (const issue of parseResult.error.issues) {
      if (issue.path[0]) {
        errosCampo[String(issue.path[0])] = issue.message;
      }
    }
    return {
      erro: "Corrija os erros apontados no formulário.",
      errosCampo,
    };
  }

  const payload = parseResult.data;
  const poloFinalId =
    perfil.papel !== "admin" && perfil.polo_id
      ? perfil.polo_id
      : payload.polo_id || perfil.polo_id || null;

  // Se não foi fornecido protocolo válido, gera atomicamente
  let protocoloFinal = payload.protocolo;
  if (!protocoloFinal || protocoloFinal.trim() === "") {
    protocoloFinal = await gerarProximoProtocolo(payload.data_solicitacao);
  }

  // Verificação de protocolo duplicado
  const duplicado = await verificarProtocoloDuplicado(protocoloFinal, chamadoId);
  if (duplicado) {
    return {
      erro: `Protocolo ${protocoloFinal} já cadastrado por ${duplicado.criado_por_nome} em ${new Date(duplicado.criado_em).toLocaleDateString("pt-BR")}.`,
      errosCampo: {
        protocolo: `Já cadastrado por ${duplicado.criado_por_nome}.`,
      },
    };
  }

  let finalChamadoId = chamadoId;

  try {
    if (chamadoId) {
      // Atualização Colaborativa com rastreamento visível
      const dataConclusao =
        payload.situacao === "concluido" || payload.situacao === "encerrado" ? new Date() : null;

      await comUsuario({ usuario_id: perfil.id, papel: perfil.papel }, async (req) => {
        req
          .input("id", sql.VarChar(50), chamadoId)
          .input("aluno_nome", sql.NVarChar(200), payload.aluno_nome.slice(0, 200))
          .input(
            "aluno_ra",
            sql.VarChar(50),
            payload.aluno_ra ? payload.aluno_ra.slice(0, 50) : null
          )
          .input(
            "aluno_cpf",
            sql.VarChar(11),
            payload.aluno_cpf ? payload.aluno_cpf.slice(0, 11) : null
          )
          .input("polo_id", sql.VarChar(50), poloFinalId)
          .input(
            "contato_telefone",
            sql.VarChar(20),
            payload.contato_telefone ? payload.contato_telefone.slice(0, 20) : null
          )
          .input("motivo_id", sql.VarChar(50), payload.motivo_id)
          .input("descricao", sql.NVarChar(sql.MAX), payload.descricao || null)
          .input("situacao", sql.VarChar(20), payload.situacao.slice(0, 20))
          .input("prioridade", sql.VarChar(20), payload.prioridade.slice(0, 20))
          .input("data_solicitacao", sql.Date, new Date(payload.data_solicitacao))
          .input("prazo", sql.Date, new Date(payload.prazo))
          .input("data_conclusao", sql.DateTimeOffset, dataConclusao)
          .input("chamado_vinculado_id", sql.VarChar(50), payload.chamado_vinculado_id || null)
          .input("observacao", sql.NVarChar(sql.MAX), payload.observacao || null)
          .input("atualizado_por", sql.VarChar(50), perfil.id)
          .input(
            "atualizado_por_nome",
            sql.NVarChar(200),
            (perfil.nome_completo || "").slice(0, 200)
          );

        await req.query(`
            UPDATE dados.chamados
            SET 
              aluno_nome = @aluno_nome,
              aluno_ra = @aluno_ra,
              aluno_cpf = @aluno_cpf,
              polo_id = @polo_id,
              contato_telefone = @contato_telefone,
              motivo_id = @motivo_id,
              descricao = @descricao,
              situacao = @situacao,
              prioridade = @prioridade,
              data_solicitacao = @data_solicitacao,
              prazo = @prazo,
              data_conclusao = @data_conclusao,
              chamado_vinculado_id = @chamado_vinculado_id,
              observacao = @observacao,
              atualizado_por = @atualizado_por,
              atualizado_por_nome = @atualizado_por_nome,
              atualizado_em = SYSUTCDATETIME()
            WHERE id = @id AND excluido_em IS NULL
          `);
      });
    } else {
      // Criação inicial
      const dataConclusao =
        payload.situacao === "concluido" || payload.situacao === "encerrado" ? new Date() : null;

      finalChamadoId = await comTransacao(
        { usuario_id: perfil.id, papel: perfil.papel },
        async (req) => {
          req
            .input("protocolo", sql.VarChar(20), protocoloFinal!.slice(0, 20))
            .input("aluno_nome", sql.NVarChar(200), payload.aluno_nome.slice(0, 200))
            .input(
              "aluno_ra",
              sql.VarChar(50),
              payload.aluno_ra ? payload.aluno_ra.slice(0, 50) : null
            )
            .input(
              "aluno_cpf",
              sql.VarChar(11),
              payload.aluno_cpf ? payload.aluno_cpf.slice(0, 11) : null
            )
            .input("polo_id", sql.VarChar(50), poloFinalId)
            .input(
              "contato_telefone",
              sql.VarChar(20),
              payload.contato_telefone ? payload.contato_telefone.slice(0, 20) : null
            )
            .input("motivo_id", sql.VarChar(50), payload.motivo_id)
            .input("descricao", sql.NVarChar(sql.MAX), payload.descricao || null)
            .input("situacao", sql.VarChar(20), payload.situacao.slice(0, 20))
            .input("prioridade", sql.VarChar(20), payload.prioridade.slice(0, 20))
            .input("data_solicitacao", sql.Date, new Date(payload.data_solicitacao))
            .input("prazo", sql.Date, new Date(payload.prazo))
            .input("data_conclusao", sql.DateTimeOffset, dataConclusao)
            .input("chamado_vinculado_id", sql.VarChar(50), payload.chamado_vinculado_id || null)
            .input("observacao", sql.NVarChar(sql.MAX), payload.observacao || null)
            .input("criado_por", sql.VarChar(50), perfil.id)
            .input(
              "criado_por_nome",
              sql.NVarChar(200),
              (perfil.nome_completo || "").slice(0, 200)
            );

          const q = await req.query(`
            DECLARE @out TABLE (id UNIQUEIDENTIFIER);

            INSERT INTO dados.chamados (
              protocolo,
              aluno_nome,
              aluno_ra,
              aluno_cpf,
              polo_id,
              contato_telefone,
              motivo_id,
              descricao,
              situacao,
              prioridade,
              data_solicitacao,
              prazo,
              data_conclusao,
              chamado_vinculado_id,
              observacao,
              criado_por,
              criado_por_nome
            )
            OUTPUT inserted.id INTO @out(id)
            VALUES (
              @protocolo,
              @aluno_nome,
              @aluno_ra,
              @aluno_cpf,
              @polo_id,
              @contato_telefone,
              @motivo_id,
              @descricao,
              @situacao,
              @prioridade,
              @data_solicitacao,
              @prazo,
              @data_conclusao,
              @chamado_vinculado_id,
              @observacao,
              @criado_por,
              @criado_por_nome
            );

            SELECT CAST(id AS NVARCHAR(50)) AS id FROM @out;
          `);

          return q.recordset[0]?.id;
        }
      );
    }

    // Processamento de múltiplos arquivos anexados no formulário
    const arquivos = formData.getAll("arquivos") as File[];
    if (finalChamadoId && arquivos && arquivos.length > 0) {
      for (const arq of arquivos) {
        if (arq && arq.size > 0 && arq.name) {
          await salvarArquivoLocal(finalChamadoId, arq, perfil);
        }
      }
    }

    revalidatePath("/chamados");
    if (finalChamadoId) {
      revalidatePath(`/chamados/${finalChamadoId}`);
    }

    return { sucesso: true, chamadoId: finalChamadoId };
  } catch (error: unknown) {
    console.error("[ERRO_SALVAR_CHAMADO]");
    const msg = error instanceof Error ? error.message : "Erro desconhecido ao salvar chamado.";
    return { erro: `Falha ao salvar chamado: ${msg}` };
  }
}

export async function anexarArquivoAction(formData: FormData) {
  const perfil = await obterPerfilAtual();
  const chamadoId = String(formData.get("chamado_id"));
  const descricao = String(formData.get("descricao") || "");
  const arquivos = formData.getAll("arquivos") as File[];

  if (!chamadoId || !arquivos || arquivos.length === 0) {
    return { sucesso: false, erro: "Nenhum arquivo informado." };
  }

  try {
    for (const arq of arquivos) {
      if (arq && arq.size > 0 && arq.name) {
        await salvarArquivoLocal(chamadoId, arq, perfil, descricao);
      }
    }

    // Atualiza metadados do chamado
    await comUsuario({ usuario_id: perfil.id, papel: perfil.papel }, async (req) => {
      await req
        .input("id", sql.VarChar(50), chamadoId)
        .input("atualizado_por", sql.VarChar(50), perfil.id)
        .input("atualizado_por_nome", sql.NVarChar(200), (perfil.nome_completo || "").slice(0, 200))
        .query(`
            UPDATE dados.chamados
            SET atualizado_por = @atualizado_por,
                atualizado_por_nome = @atualizado_por_nome,
                atualizado_em = SYSUTCDATETIME()
            WHERE id = @id AND excluido_em IS NULL
          `);
    });

    revalidatePath(`/chamados/${chamadoId}`);
    return { sucesso: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Falha ao anexar arquivo.";
    return { sucesso: false, erro: msg };
  }
}

export async function excluirArquivoAction(arquivoId: string, chamadoId: string) {
  const perfil = await obterPerfilAtual();

  try {
    await comUsuario({ usuario_id: perfil.id, papel: perfil.papel }, async (req) => {
      await req
        .input("id", sql.VarChar(50), arquivoId)
        .input("chamado_id", sql.VarChar(50), chamadoId).query(`
            DELETE FROM dados.arquivos_chamados
            WHERE id = @id AND chamado_id = @chamado_id
          `);
    });

    try {
      const pool = await getPool();
      await pool
        .request()
        .input("regId", sql.VarChar(50), arquivoId)
        .query(
          `DELETE FROM auditoria.logs WHERE tabela = 'arquivos_conteudo' AND registro_id = @regId`
        );
    } catch (cleanErr) {
      console.warn("[STORAGE] Falha ao limpar conteudo do anexo no banco:", cleanErr);
    }

    revalidatePath(`/chamados/${chamadoId}`);
    return { sucesso: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro ao remover anexo.";
    return { sucesso: false, erro: msg };
  }
}

export async function excluirChamadoAction(id: string) {
  const perfil = await obterPerfilAtual();

  try {
    // Soft delete seguro via comUsuario (RLS e autoridade de admin ou criador)
    await comUsuario({ usuario_id: perfil.id, papel: perfil.papel }, async (req) => {
      const queryAdmin = perfil.papel === "admin" ? "" : " AND criado_por = @usuario_logado";

      req.input("id", sql.VarChar(50), id);
      req.input("usuario_logado", sql.VarChar(50), perfil.id);

      const res = await req.query(`
          UPDATE dados.chamados
          SET excluido_em = SYSUTCDATETIME(),
              excluido_por = @usuario_logado
          WHERE id = @id AND excluido_em IS NULL ${queryAdmin}
        `);

      if (res.rowsAffected[0] === 0) {
        throw new Error("Chamado não encontrado ou você não possui permissão para excluí-lo.");
      }
    });

    revalidatePath("/chamados");
    return { sucesso: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Erro ao excluir chamado.";
    return { sucesso: false, erro: msg };
  }
}
