/**
 * ROTA DE DIAGNÓSTICO TEMPORÁRIA — REMOVER APÓS RESOLVER O BUG DO RANKING
 * Acesse: /api/debug-painel
 * Retorna JSON com contagens e amostra dos chamados no banco.
 */
import { NextResponse } from "next/server";
import { obterPerfilAtual } from "@/lib/auth/perfil";
import { comUsuario } from "@/lib/db/comUsuario";
import { sql } from "@/lib/db/pool";
import { format, startOfMonth, endOfMonth, subMonths } from "date-fns";

export async function GET() {
  try {
    const perfil = await obterPerfilAtual();

    // Só admin pode acessar
    if (perfil.papel !== "admin") {
      return NextResponse.json({ erro: "Acesso negado" }, { status: 403 });
    }

    const hoje = new Date();
    const dataInicioMes = format(startOfMonth(hoje), "yyyy-MM-01");
    const dataFimMes = format(endOfMonth(hoje), "yyyy-MM-dd");
    const dataInicio12m = format(subMonths(hoje, 11), "yyyy-MM-01");

    const resultado = await comUsuario(
      { usuario_id: perfil.id, papel: perfil.papel },
      async (req) => {
        req.input("dtInicioMes", sql.Date, new Date(dataInicioMes + "T12:00:00"));
        req.input("dtFimMes", sql.Date, new Date(dataFimMes + "T12:00:00"));
        req.input("dtInicio12m", sql.Date, new Date(dataInicio12m + "T12:00:00"));

        const batch = await req.query(`
          -- Contagem total sem filtro de data
          SELECT COUNT(*) AS total_sem_filtro
          FROM dados.chamados
          WHERE excluido_em IS NULL;

          -- Contagem no mês atual
          SELECT COUNT(*) AS total_mes_atual
          FROM dados.chamados
          WHERE excluido_em IS NULL
            AND data_solicitacao >= @dtInicioMes
            AND data_solicitacao <= @dtFimMes;

          -- Contagem nos últimos 12 meses
          SELECT COUNT(*) AS total_12m
          FROM dados.chamados
          WHERE excluido_em IS NULL
            AND data_solicitacao >= @dtInicio12m;

          -- Amostra dos 10 chamados mais recentes
          SELECT TOP 10
            c.protocolo,
            CONVERT(VARCHAR(10), c.data_solicitacao, 23) AS data_solicitacao,
            c.situacao,
            c.criado_por,
            c.criado_por_nome,
            CAST(c.polo_id AS NVARCHAR(50)) AS polo_id
          FROM dados.chamados c
          WHERE c.excluido_em IS NULL
          ORDER BY c.data_solicitacao DESC;

          -- Datas mínima e máxima dos chamados
          SELECT
            CONVERT(VARCHAR(10), MIN(data_solicitacao), 23) AS data_mais_antiga,
            CONVERT(VARCHAR(10), MAX(data_solicitacao), 23) AS data_mais_recente,
            COUNT(*) AS total_geral
          FROM dados.chamados
          WHERE excluido_em IS NULL;
        `);

        const rsets = batch.recordsets as any[];
        return {
          totalSemFiltro: rsets[0]?.[0]?.total_sem_filtro ?? "?",
          totalMesAtual: rsets[1]?.[0]?.total_mes_atual ?? "?",
          total12m: rsets[2]?.[0]?.total_12m ?? "?",
          amostraRecentes: rsets[3] ?? [],
          resumo: rsets[4]?.[0] ?? {},
          parametros: {
            hoje: format(hoje, "yyyy-MM-dd"),
            dataInicioMes,
            dataFimMes,
            dataInicio12m,
            perfilPapel: perfil.papel,
            perfilId: perfil.id,
          },
        };
      }
    );

    return NextResponse.json(resultado, { status: 200 });
  } catch (err: unknown) {
    return NextResponse.json(
      { erro: String(err instanceof Error ? err.message : err) },
      { status: 500 }
    );
  }
}
