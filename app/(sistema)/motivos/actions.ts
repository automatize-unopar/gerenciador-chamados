"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { obterPerfilAtual } from "@/lib/auth/perfil";
import { comUsuario, comTransacao } from "@/lib/db/comUsuario";
import { sql } from "@/lib/db/pool";
import { capitalizarMotivo } from "@/lib/utils/capitalizar-motivo";

const motivoSchema = z.object({
  id: z.string().optional(),
  nome: z.string().trim().min(3, "O nome do motivo deve conter pelo menos 3 caracteres."),
  filtro: z
    .string()
    .trim()
    .min(1, "Informe o Filtro (Caminho do Motivo).")
    .max(500, "O caminho deve ter no máximo 500 caracteres."),
});

export type SimilaridadeResultado = {
  id: string;
  codigo: string;
  nome: string;
  similaridade: number;
};

export type EstadoSalvarMotivo = {
  sucesso?: boolean;
  motivoId?: string;
  erro?: string;
  similares?: SimilaridadeResultado[];
  requerConfirmacao?: boolean;
};

function normalizarTexto(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

export async function verificarSimilaridade(nome: string): Promise<SimilaridadeResultado[]> {
  if (!nome || nome.trim().length < 3) return [];

  const perfil = await obterPerfilAtual();
  const normalizado = normalizarTexto(nome);

  return await comUsuario({ usuario_id: perfil.id, papel: perfil.papel }, async (req) => {
    req.input("termo", sql.VarChar(255), `%${normalizado}%`);
    const q = await req.query(`
        SELECT TOP 5
          CAST(id AS NVARCHAR(50)) AS id,
          codigo,
          nome,
          1.0 AS similaridade
        FROM dados.motivos
        WHERE nome_normalizado LIKE @termo OR @termo LIKE '%' + nome_normalizado + '%'
      `);
    return q.recordset;
  });
}

export async function salvarMotivoAction(
  _estadoAnterior: EstadoSalvarMotivo,
  formData: FormData
): Promise<EstadoSalvarMotivo> {
  const perfil = await obterPerfilAtual();
  const id = formData.get("id") ? String(formData.get("id")) : undefined;
  const nome = String(formData.get("nome") || "");
  const filtro = String(formData.get("filtro") || "");
  const confirmacaoForcada = formData.get("confirmacao_forcada") === "true";

  const parseResult = motivoSchema.safeParse({ id, nome, filtro });
  if (!parseResult.success) {
    return { erro: parseResult.error.issues[0]?.message || "Nome inválido." };
  }

  const nomeLimpo = capitalizarMotivo(parseResult.data.nome);
  const nomeNormalizado = normalizarTexto(nomeLimpo);
  const filtroLimpo = parseResult.data.filtro;

  // Se não for edição e não foi confirmação forçada, verifica similaridade
  if (!id && !confirmacaoForcada) {
    const similares = await verificarSimilaridade(nomeLimpo);
    if (similares.length > 0) {
      return {
        requerConfirmacao: true,
        similares,
        erro: `Identificamos ${similares.length} motivo(s) similar(es) no catálogo. Verifique antes de cadastrar.`,
      };
    }
  }

  try {
    const motivoId = await comTransacao(
      { usuario_id: perfil.id, papel: perfil.papel },
      async (req) => {
        // Verifica se a coluna filtro existe na tabela dados.motivos
        const checkCol = await req.query(`
          SELECT 1 FROM sys.columns 
          WHERE object_id = OBJECT_ID('dados.motivos') AND name = 'filtro'
        `);
        const temColunaFiltro = checkCol.recordset.length > 0;
        if (!temColunaFiltro) {
          throw new Error(
            "O banco precisa da coluna filtro para salvar o caminho obrigatório do motivo."
          );
        }

        // Se for edição de um motivo existente
        if (id) {
          req.input("id", sql.VarChar(50), id);
          req.input("nomeNormalizado", sql.VarChar(255), nomeNormalizado);

          // Verifica duplicata em outro motivo
          const dup = await req.query(`
            SELECT id FROM dados.motivos 
            WHERE nome_normalizado = @nomeNormalizado AND id <> @id
          `);
          if (dup.recordset.length > 0) {
            throw new Error("Já existe outro motivo com este mesmo nome no catálogo.");
          }

          req.input("nome", sql.NVarChar(255), nomeLimpo);
          if (temColunaFiltro) {
            req.input("filtro", sql.NVarChar(500), filtroLimpo);
            await req.query(`
              UPDATE dados.motivos
              SET nome = @nome,
                  filtro = @filtro
              WHERE id = @id
            `);
          } else {
            await req.query(`
              UPDATE dados.motivos
              SET nome = @nome
              WHERE id = @id
            `);
          }

          return id;
        }

        // Se for novo cadastro: Verifica duplicata exata
        req.input("nomeNormalizado", sql.VarChar(255), nomeNormalizado);
        const dup = await req.query(`
          SELECT id FROM dados.motivos WHERE nome_normalizado = @nomeNormalizado
        `);
        if (dup.recordset.length > 0) {
          throw new Error("Já existe exatamente este mesmo motivo cadastrado no catálogo.");
        }

        // Obtém próximo número sequencial
        const qNum = await req.query(`
          SELECT ISNULL(MAX(numero), 0) + 1 AS proximo FROM dados.motivos WITH (UPDLOCK, HOLDLOCK)
        `);
        const proximoNumero = qNum.recordset[0]?.proximo || 1;

        req.input("numero", sql.Int, proximoNumero);
        req.input("nome", sql.NVarChar(255), nomeLimpo);
        req.input("criado_por", sql.VarChar(50), perfil.id);

        if (temColunaFiltro) {
          req.input("filtro", sql.NVarChar(500), filtroLimpo);
          const qInsert = await req.query(`
            DECLARE @out TABLE (id UNIQUEIDENTIFIER);

            INSERT INTO dados.motivos (
              numero,
              nome,
              filtro,
              ativo,
              criado_por
            )
            OUTPUT inserted.id INTO @out(id)
            VALUES (
              @numero,
              @nome,
              @filtro,
              1,
              @criado_por
            );

            SELECT CAST(id AS NVARCHAR(50)) AS id FROM @out;
          `);
          return qInsert.recordset[0]?.id;
        } else {
          const qInsert = await req.query(`
            DECLARE @out TABLE (id UNIQUEIDENTIFIER);

            INSERT INTO dados.motivos (
              numero,
              nome,
              ativo,
              criado_por
            )
            OUTPUT inserted.id INTO @out(id)
            VALUES (
              @numero,
              @nome,
              1,
              @criado_por
            );

            SELECT CAST(id AS NVARCHAR(50)) AS id FROM @out;
          `);
          return qInsert.recordset[0]?.id;
        }
      }
    );

    revalidatePath("/motivos");
    revalidatePath("/chamados");
    revalidatePath("/chamados/novo");
    return { sucesso: true, motivoId };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Erro ao salvar motivo.";
    return { erro: msg };
  }
}

export async function alternarStatusMotivoAction(id: string, ativo: boolean) {
  const perfil = await obterPerfilAtual();

  try {
    await comUsuario({ usuario_id: perfil.id, papel: perfil.papel }, async (req) => {
      req.input("id", sql.VarChar(50), id);
      req.input("ativo", sql.Bit, ativo ? 1 : 0);
      await req.query(`
          UPDATE dados.motivos
          SET ativo = @ativo
          WHERE id = @id
        `);
    });

    revalidatePath("/motivos");
    return { sucesso: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Falha ao alterar status do motivo.";
    return { sucesso: false, erro: msg };
  }
}
