import { cache } from "react";
import { comUsuario } from "@/lib/db/comUsuario";
import { sql } from "@/lib/db/pool";
import { type Perfil } from "@/types/database";
import { differenceInCalendarDays, startOfDay, endOfDay, addDays } from "date-fns";

export interface ItemNotificacaoPrazo {
  id: string;
  protocolo: string;
  aluno_nome: string;
  prazo: string;
  situacao: string;
  prioridade: string;
  motivo_nome?: string;
  polo_nome?: string;
  statusPrazo: "vencido" | "vence_hoje" | "vence_breve";
  diasDiferenca: number;
  rotuloPrazo: string;
}

export interface DadosNotificacoesPrazos {
  vencidos: number;
  vencendoBreve: number;
  totalCriticos: number;
  itens: ItemNotificacaoPrazo[];
}

export const obterNotificacoesPrazos = cache(
  async (perfil: Perfil): Promise<DadosNotificacoesPrazos> => {
    try {
      const ehAdmin = perfil.papel === "admin";
      const hoje = new Date();
      const hojeStart = startOfDay(hoje);
      // Notificações alertam sobre chamados vencidos e chamados que vencem em até 2 dias
      const limiteMaximo = endOfDay(addDays(hoje, 2));

      return await comUsuario({ usuario_id: perfil.id, papel: perfil.papel }, async (req) => {
        let sqlFiltros =
          "WHERE c.excluido_em IS NULL AND c.situacao IN ('aguardando', 'escalonado')";

        // Se não for admin e tiver polo associado, restringe aos chamados do polo
        if (!ehAdmin && perfil.polo_id) {
          req.input("poloId", sql.VarChar(50), perfil.polo_id);
          sqlFiltros += " AND c.polo_id = @poloId";
        } else if (!ehAdmin) {
          req.input("usuarioId", sql.VarChar(50), perfil.id);
          sqlFiltros += " AND c.criado_por = @usuarioId";
        }

        req.input("limiteMaximo", sql.DateTimeOffset, limiteMaximo);
        sqlFiltros += " AND c.prazo <= @limiteMaximo";

        const resultado = await req.query(`
          SELECT TOP 40
            CAST(c.id AS NVARCHAR(50)) AS id,
            c.protocolo,
            c.aluno_nome,
            c.prazo,
            c.situacao,
            c.prioridade,
            m.nome AS motivo_nome,
            pol.nome AS polo_nome
          FROM dados.chamados c
          LEFT JOIN dados.motivos m ON m.id = c.motivo_id
          LEFT JOIN dados.polos pol ON pol.id = c.polo_id
          ${sqlFiltros}
          ORDER BY c.prazo ASC
        `);

        let totalVencidos = 0;
        let totalVencendoBreve = 0;

        const itens: ItemNotificacaoPrazo[] = (resultado.recordset || []).map((row: any) => {
          const dataPrazo = new Date(row.prazo);
          const prazoStart = startOfDay(dataPrazo);
          const diff = differenceInCalendarDays(prazoStart, hojeStart);

          let statusPrazo: "vencido" | "vence_hoje" | "vence_breve";
          let rotuloPrazo: string;

          if (diff < 0) {
            statusPrazo = "vencido";
            const diasAtraso = Math.abs(diff);
            rotuloPrazo = diasAtraso === 1 ? "Vencido ontem" : `Vencido há ${diasAtraso} dias`;
            totalVencidos++;
          } else if (diff === 0) {
            statusPrazo = "vence_hoje";
            rotuloPrazo = "Vence hoje";
            totalVencendoBreve++;
          } else if (diff === 1) {
            statusPrazo = "vence_breve";
            rotuloPrazo = "Vence amanhã";
            totalVencendoBreve++;
          } else {
            statusPrazo = "vence_breve";
            rotuloPrazo = `Vence em ${diff} dias`;
            totalVencendoBreve++;
          }

          return {
            id: row.id,
            protocolo: row.protocolo,
            aluno_nome: row.aluno_nome,
            prazo: dataPrazo.toISOString(),
            situacao: row.situacao,
            prioridade: row.prioridade,
            motivo_nome: row.motivo_nome ?? undefined,
            polo_nome: row.polo_nome ?? undefined,
            statusPrazo,
            diasDiferenca: diff,
            rotuloPrazo,
          };
        });

        return {
          vencidos: totalVencidos,
          vencendoBreve: totalVencendoBreve,
          totalCriticos: totalVencidos + totalVencendoBreve,
          itens,
        };
      });
    } catch (erro) {
      console.error("Erro ao buscar notificações de prazos:", erro);
      return {
        vencidos: 0,
        vencendoBreve: 0,
        totalCriticos: 0,
        itens: [],
      };
    }
  }
);
