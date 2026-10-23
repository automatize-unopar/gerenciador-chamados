import { notFound } from "next/navigation";
import { lerObjetoAuditoria, lerCamposAlterados, dataIsoOuNull } from "@/lib/chamados/historico";
import { obterPerfilAtual } from "@/lib/auth/perfil";
import { comUsuario } from "@/lib/db/comUsuario";
import { sql } from "@/lib/db/pool";
import { PainelDetalheChamado } from "./painel-detalhe-chamado";
import { type ArquivoChamado, type LogAuditoria } from "@/types/database";

interface DetailPageProps {
  params: Promise<{
    id: string;
  }>;
}

export default async function PaginaDetalheChamado({ params }: DetailPageProps) {
  const { id } = await params;
  const perfilAtual = await obterPerfilAtual();

  const dadosCarregados = await comUsuario(
    { usuario_id: perfilAtual.id, papel: perfilAtual.papel },
    async (req) => {
      // 1. Carregar chamado principal com motivo e perfis
      const qChamado = await req.input("id", sql.VarChar(50), id).query(`
          SELECT 
            CAST(c.id AS NVARCHAR(50)) AS id,
            c.protocolo,
            c.aluno_nome,
            c.aluno_ra,
            c.aluno_cpf,
            CAST(c.polo_id AS NVARCHAR(50)) AS polo_id,
            pol.nome AS polo_nome,
            pol.cidade AS polo_cidade,
            pol.codigo AS polo_codigo,
            c.contato_telefone,
            CAST(c.motivo_id AS NVARCHAR(50)) AS motivo_id,
            c.descricao,
            c.situacao,
            c.prioridade,
            c.data_solicitacao,
            c.prazo,
            c.data_conclusao,
            CAST(c.chamado_vinculado_id AS NVARCHAR(50)) AS chamado_vinculado_id,
            c.observacao,
            c.importado,
            CAST(c.criado_por AS NVARCHAR(50)) AS criado_por,
            c.criado_por_nome,
            CAST(c.atualizado_por AS NVARCHAR(50)) AS atualizado_por,
            c.atualizado_por_nome,
            c.criado_em,
            c.atualizado_em,
            CAST(m.id AS NVARCHAR(50)) AS motivo_id_join,
            m.codigo AS motivo_codigo,
            m.nome AS motivo_nome,
            pCriador.nome_completo AS criador_nome,
            pCriador.email AS criador_email,
            pAtualizador.nome_completo AS atualizador_nome,
            pAtualizador.email AS atualizador_email
          FROM dados.chamados c
          LEFT JOIN dados.polos pol ON pol.id = c.polo_id
          LEFT JOIN dados.motivos m ON m.id = c.motivo_id
          LEFT JOIN dados.perfis pCriador ON pCriador.id = c.criado_por
          LEFT JOIN dados.perfis pAtualizador ON pAtualizador.id = c.atualizado_por
          WHERE (c.id = TRY_CAST(@id AS UNIQUEIDENTIFIER) OR CAST(c.id AS NVARCHAR(50)) = @id) AND c.excluido_em IS NULL
        `);

      const chamado = qChamado.recordset[0];
      if (!chamado) return null;

      // 2. Carregar arquivos vinculados
      const qArquivos = await req.query(`
        SELECT 
          CAST(a.id AS NVARCHAR(50)) AS id,
          CAST(a.chamado_id AS NVARCHAR(50)) AS chamado_id,
          a.nome_original,
          a.caminho_storage,
          a.tamanho_bytes,
          a.tipo_mime,
          a.descricao,
          CAST(a.criado_por AS NVARCHAR(50)) AS criado_por,
          a.criado_por_nome,
          a.criado_em
        FROM dados.arquivos_chamados a
        WHERE a.chamado_id = @id
        ORDER BY a.criado_em DESC
      `);

      // 3. Carregar chamado vinculado anterior (se houver)
      let chamadoAnterior = null;
      if (chamado.chamado_vinculado_id) {
        req.input("vinculadoId", sql.VarChar(50), chamado.chamado_vinculado_id);
        const qAnt = await req.query(`
          SELECT 
            CAST(id AS NVARCHAR(50)) AS id,
            protocolo,
            aluno_nome,
            situacao,
            data_solicitacao
          FROM dados.chamados
          WHERE id = @vinculadoId
        `);
        chamadoAnterior = qAnt.recordset[0] || null;
      }

      // 4. Carregar chamados posteriores
      const qPosteriores = await req.query(`
        SELECT 
          CAST(c.id AS NVARCHAR(50)) AS id,
          c.protocolo,
          c.aluno_nome,
          c.situacao,
          c.data_solicitacao,
          p.nome_completo AS criador_nome
        FROM dados.chamados c
        LEFT JOIN dados.perfis p ON p.id = c.criado_por
        WHERE c.chamado_vinculado_id = @id AND c.excluido_em IS NULL
      `);

      // 5. Carregar logs de auditoria
      const qLogs = await req
        .query(
          `
        SELECT 
          id,
          tabela,
          registro_id,
          operacao,
          dados_antes,
          dados_depois,
          campos_alterados,
          CAST(usuario_id AS NVARCHAR(50)) AS usuario_id,
          usuario_nome,
          protocolo,
          ip,
          criado_em
        FROM auditoria.logs
        WHERE tabela = 'chamados' AND registro_id = CAST(@id AS NVARCHAR(50))
        ORDER BY criado_em DESC
      `
        )
        .catch(() => ({ recordset: [] })); // Fallback caso auditoria.logs ainda não esteja populada

      return {
        chamado,
        arquivos: qArquivos.recordset,
        chamadoAnterior,
        chamadosPosteriores: qPosteriores.recordset,
        logs: qLogs.recordset,
      };
    }
  );

  if (!dadosCarregados || !dadosCarregados.chamado) {
    notFound();
  }

  const { chamado, arquivos, chamadoAnterior, chamadosPosteriores, logs } = dadosCarregados;

  const chamadoFormatado = {
    id: chamado.id,
    protocolo: chamado.protocolo,
    aluno_nome: chamado.aluno_nome,
    aluno_ra: chamado.aluno_ra,
    aluno_cpf: chamado.aluno_cpf,
    polo_id: chamado.polo_id,
    polo_nome: chamado.polo_nome,
    polo_cidade: chamado.polo_cidade,
    polo_codigo: chamado.polo_codigo,
    contato_telefone: chamado.contato_telefone,
    motivo_id: chamado.motivo_id,
    descricao: chamado.descricao,
    situacao: chamado.situacao,
    prioridade: chamado.prioridade,
    data_solicitacao: chamado.data_solicitacao
      ? dataIsoOuNull(chamado.data_solicitacao) || new Date().toISOString()
      : new Date().toISOString(),
    prazo: chamado.prazo
      ? dataIsoOuNull(chamado.prazo) || new Date().toISOString()
      : new Date().toISOString(),
    data_conclusao: dataIsoOuNull(chamado.data_conclusao),
    chamado_vinculado_id: chamado.chamado_vinculado_id,
    observacao: chamado.observacao,
    importado: Boolean(chamado.importado),
    criado_por: chamado.criado_por,
    criado_por_nome: chamado.criado_por_nome || chamado.criador_nome,
    atualizado_por: chamado.atualizado_por,
    atualizado_por_nome: chamado.atualizado_por_nome || chamado.atualizador_nome,
    criado_em: chamado.criado_em
      ? dataIsoOuNull(chamado.criado_em) || new Date().toISOString()
      : new Date().toISOString(),
    atualizado_em: chamado.atualizado_em
      ? dataIsoOuNull(chamado.atualizado_em) || new Date().toISOString()
      : new Date().toISOString(),
    motivos: chamado.motivo_id_join
      ? { id: chamado.motivo_id_join, codigo: chamado.motivo_codigo, nome: chamado.motivo_nome }
      : undefined,
    perfisCriador: chamado.criado_por
      ? {
          id: chamado.criado_por,
          nome_completo: chamado.criado_por_nome || chamado.criador_nome,
          email: chamado.criador_email,
        }
      : undefined,
    perfisAtualizador: chamado.atualizado_por
      ? {
          id: chamado.atualizado_por,
          nome_completo: chamado.atualizado_por_nome || chamado.atualizador_nome,
          email: chamado.atualizador_email,
        }
      : undefined,
  };

  const arquivosFormatados: ArquivoChamado[] = arquivos.map((a: any) => ({
    id: a.id,
    chamado_id: a.chamado_id,
    nome_original: a.nome_original,
    caminho_storage: a.caminho_storage,
    tamanho_bytes: a.tamanho_bytes,
    tipo_mime: a.tipo_mime,
    descricao: a.descricao,
    criado_por: a.criado_por,
    criado_por_nome: a.criado_por_nome,
    criado_em: a.criado_em
      ? dataIsoOuNull(a.criado_em) || new Date().toISOString()
      : new Date().toISOString(),
  }));

  const logsFormatados: LogAuditoria[] = logs.map((l: any) => ({
    id: l.id,
    tabela: l.tabela,
    registro_id: l.registro_id,
    operacao: l.operacao,
    dados_antes: lerObjetoAuditoria(l.dados_antes),
    dados_depois: lerObjetoAuditoria(l.dados_depois),
    campos_alterados: lerCamposAlterados(l.campos_alterados),
    usuario_id: l.usuario_id,
    usuario_nome: l.usuario_nome,
    protocolo: l.protocolo,
    ip: l.ip,
    criado_em: l.criado_em
      ? dataIsoOuNull(l.criado_em) || new Date().toISOString()
      : new Date().toISOString(),
  }));

  return (
    <PainelDetalheChamado
      chamado={chamadoFormatado as any}
      arquivos={arquivosFormatados as any}
      chamadoAnterior={
        chamadoAnterior
          ? {
              ...chamadoAnterior,
              data_solicitacao:
                dataIsoOuNull(chamadoAnterior.data_solicitacao) ||
                chamadoFormatado.data_solicitacao,
            }
          : null
      }
      chamadosPosteriores={chamadosPosteriores.map((post: any) => ({
        ...post,
        data_solicitacao: dataIsoOuNull(post.data_solicitacao) || chamadoFormatado.data_solicitacao,
      }))}
      logs={logsFormatados}
      perfilAtual={perfilAtual}
    />
  );
}
