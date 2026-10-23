import { chamadoEstaAberto } from "@/lib/chamados/situacao";
import { obterPerfilAtual } from "@/lib/auth/perfil";
import { comUsuario } from "@/lib/db/comUsuario";
import { sql } from "@/lib/db/pool";
import { PainelDashboard } from "./painel-dashboard";
import {
  startOfMonth,
  endOfMonth,
  subMonths,
  format,
  isBefore,
  addDays,
  startOfDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";

interface PageProps {
  searchParams: Promise<{
    periodo?: string;
    polo_id?: string;
  }>;
}

export default async function PaginaPainel({ searchParams }: PageProps) {
  const perfilAtual = await obterPerfilAtual();
  const params = await searchParams;

  const podeVerTodosPolos = perfilAtual.papel === "admin" || perfilAtual.papel === "coordenador";

  const periodo = params.periodo || "mes_atual";
  // Atendentes visualizam obrigatoriamente apenas o seu próprio polo
  const poloId = podeVerTodosPolos ? params.polo_id || "todos" : perfilAtual.polo_id || "sem_polo";
  const hoje = new Date();

  let dataInicioStr = "";
  let dataFimStr = format(hoje, "yyyy-MM-dd");

  if (periodo === "mes_atual") {
    dataInicioStr = format(startOfMonth(hoje), "yyyy-MM-01");
    dataFimStr = format(endOfMonth(hoje), "yyyy-MM-dd");
  } else if (periodo === "semestre_atual") {
    const ano = hoje.getFullYear();
    const mes = hoje.getMonth() + 1;
    if (mes <= 6) {
      dataInicioStr = `${ano}-01-01`;
      dataFimStr = `${ano}-06-30`;
    } else {
      dataInicioStr = `${ano}-07-01`;
      dataFimStr = `${ano}-12-31`;
    }
  } else {
    dataInicioStr = format(subMonths(hoje, 11), "yyyy-MM-01");
  }

  const dadosBanco = await comUsuario(
    { usuario_id: perfilAtual.id, papel: perfilAtual.papel },
    async (req) => {
      let sqlPolo = "";
      if (poloId !== "todos") {
        req.input("poloId", sql.VarChar(50), poloId);
        sqlPolo = " AND c.polo_id = @poloId";
      }

      req.input("dtInicio", sql.DateTimeOffset, new Date(dataInicioStr));
      req.input("dtFim", sql.DateTimeOffset, new Date(dataFimStr + "T23:59:59.999Z"));
      const dtInicio12m = format(subMonths(hoje, 11), "yyyy-MM-01");
      req.input("dtInicio12m", sql.DateTimeOffset, new Date(dtInicio12m));

      const batch = await req.query(`
        -- 1. Perfis ativos e avatares
        SELECT 
          CAST(p.id AS NVARCHAR(50)) AS id, 
          p.nome_completo, 
          p.papel,
          CAST(p.polo_id AS NVARCHAR(50)) AS polo_id,
          av.dados_depois AS avatar_json,
          av.operacao AS avatar_operacao
        FROM dados.perfis p
        OUTER APPLY (
          SELECT TOP 1 dados_depois, operacao
          FROM auditoria.logs
          WHERE tabela = 'perfis_avatar' AND registro_id = p.id
          ORDER BY id DESC
        ) av
        WHERE p.ativo = 1;

        -- 2. Polos ativos
        SELECT CAST(id AS NVARCHAR(50)) AS id, nome, codigo, cidade, estado, ativo, criado_em
        FROM dados.polos
        WHERE ativo = 1
        ORDER BY nome ASC;

        -- 3. Chamados do período
        SELECT 
          CAST(c.id AS NVARCHAR(50)) AS id,
          c.protocolo,
          c.aluno_nome,
          c.aluno_cpf,
          c.situacao,
          c.prioridade,
          c.data_solicitacao,
          c.prazo,
          c.data_conclusao,
          m.codigo AS motivo_codigo,
          m.nome AS motivo_nome,
          CAST(p.id AS NVARCHAR(50)) AS criador_id,
          p.nome_completo AS criador_nome,
          p.papel AS criador_papel
        FROM dados.chamados c
        LEFT JOIN dados.motivos m ON m.id = c.motivo_id
        LEFT JOIN dados.perfis p ON p.id = c.criado_por
        WHERE c.excluido_em IS NULL
          AND c.data_solicitacao >= @dtInicio
          AND c.data_solicitacao <= @dtFim
          ${sqlPolo};

        -- 4. Chamados dos últimos 12 meses
        SELECT 
          c.data_solicitacao,
          c.situacao,
          c.prazo,
          c.data_conclusao
        FROM dados.chamados c
        WHERE c.excluido_em IS NULL
          AND c.data_solicitacao >= @dtInicio12m
          ${sqlPolo};
      `);

      const rsets = batch.recordsets as any[];

      return {
        perfis: rsets[0] || [],
        polos: rsets[1] || [],
        chamadosPeriodo: rsets[2] || [],
        chamados12m: rsets[3] || [],
      };
    }
  );

  const contagemColaboradores: Record<
    string,
    {
      id: string;
      nome: string;
      papel: string;
      fotoUrl?: string;
      resolvidos: number;
      abertos: number;
      total: number;
      diasTotais: number;
    }
  > = {};
  const contagemMotivos: Record<
    string,
    { codigo: string; nome: string; total: number; diasTotais: number; concluidos: number }
  > = {};

  const mapaPerfisFotos = new Map<string, string | null>();
  for (const p of dadosBanco.perfis) {
    let avatarUrl: string | null = null;
    if (p.avatar_json && p.avatar_operacao !== "DELETE") {
      try {
        const parsed = JSON.parse(p.avatar_json);
        avatarUrl = parsed.avatar || null;
      } catch {}
    }
    mapaPerfisFotos.set(p.id, avatarUrl);

    // Administradores não participam do ranking da equipe
    if (p.papel === "admin") continue;

    // Se um polo específico estiver selecionado (ou para atendente), apenas colaboradores do polo entram no ranking inicial
    if (poloId !== "todos" && p.polo_id !== poloId) continue;

    contagemColaboradores[p.id] = {
      id: p.id,
      nome: p.nome_completo,
      papel: p.papel === "coordenador" ? "Coordenador" : "Atendimento",
      fotoUrl: avatarUrl || undefined,
      resolvidos: 0,
      abertos: 0,
      total: 0,
      diasTotais: 0,
    };
  }

  const lista = dadosBanco.chamadosPeriodo;
  const hojeStart = startOfDay(hoje);
  const limite2Dias = addDays(hojeStart, 2);

  let total = lista.length;
  let aguardando = 0;
  let concluidos = 0;
  let encerrados = 0;
  let vencidos = 0;
  let vencendo_em_2_dias = 0;

  const chamadosCriticos: {
    id: string;
    protocolo: string;
    aluno_nome: string;
    prazo: string;
    status: "vencido" | "vencendo_em_2_dias";
    atendente: string;
  }[] = [];

  let somaDiasGeral = 0;
  let totalConcluidosGeral = 0;

  for (const c of lista) {
    if (chamadoEstaAberto(c.situacao)) aguardando++;
    if (c.situacao === "concluido") concluidos++;
    if (c.situacao === "encerrado") encerrados++;

    const dataPrazo = startOfDay(new Date(c.prazo));
    const colabId = c.criador_id || "anon";
    const colabNome = c.criador_nome || "Atendente";
    const colabPapel =
      c.criador_papel === "admin"
        ? "Administrador"
        : c.criador_papel === "coordenador"
          ? "Coordenador"
          : "Atendimento";

    // Apenas colaboradores que não são administradores participam do ranking
    if (c.criador_papel !== "admin") {
      if (!contagemColaboradores[colabId]) {
        contagemColaboradores[colabId] = {
          id: colabId,
          nome: colabNome,
          papel: colabPapel,
          fotoUrl: mapaPerfisFotos.get(colabId) || undefined,
          resolvidos: 0,
          abertos: 0,
          total: 0,
          diasTotais: 0,
        };
      }
      contagemColaboradores[colabId].total++;

      if (c.situacao === "concluido") {
        contagemColaboradores[colabId].resolvidos++;
      } else {
        contagemColaboradores[colabId].abertos++;
      }
    }

    if (chamadoEstaAberto(c.situacao)) {
      if (isBefore(dataPrazo, hojeStart)) {
        vencidos++;
        chamadosCriticos.push({
          id: c.id,
          protocolo: c.protocolo,
          aluno_nome: c.aluno_nome,
          prazo: new Date(c.prazo).toISOString(),
          status: "vencido",
          atendente: colabNome,
        });
      } else if (
        isBefore(dataPrazo, limite2Dias) ||
        dataPrazo.getTime() === limite2Dias.getTime()
      ) {
        vencendo_em_2_dias++;
        chamadosCriticos.push({
          id: c.id,
          protocolo: c.protocolo,
          aluno_nome: c.aluno_nome,
          prazo: new Date(c.prazo).toISOString(),
          status: "vencendo_em_2_dias",
          atendente: colabNome,
        });
      }
    }

    const cod = c.motivo_codigo || "#00";
    const nomeMot = c.motivo_nome || "Outros";
    if (!contagemMotivos[cod]) {
      contagemMotivos[cod] = { codigo: cod, nome: nomeMot, total: 0, diasTotais: 0, concluidos: 0 };
    }
    contagemMotivos[cod].total++;

    if (c.situacao === "concluido" && c.data_conclusao) {
      const dias = Math.max(
        0,
        Math.round(
          (new Date(c.data_conclusao).getTime() - new Date(c.data_solicitacao).getTime()) /
            (1000 * 60 * 60 * 24)
        )
      );
      contagemMotivos[cod].diasTotais += dias;
      contagemMotivos[cod].concluidos++;
      if (c.criador_papel !== "admin" && colabId && contagemColaboradores[colabId]) {
        contagemColaboradores[colabId].diasTotais += dias;
      }
      somaDiasGeral += dias;
      totalConcluidosGeral++;
    }
  }

  const rankingEquipe = Object.values(contagemColaboradores)
    .sort((a, b) => {
      if (b.resolvidos !== a.resolvidos) return b.resolvidos - a.resolvidos;
      return b.total - a.total;
    })
    .map((c, index) => {
      const pctResolvidos = c.total > 0 ? Math.round((c.resolvidos / c.total) * 100) : 0;
      const pctAbertos = c.total > 0 ? Math.round((c.abertos / c.total) * 100) : 0;
      const tempoMedioDias =
        c.resolvidos > 0 ? Math.round((c.diasTotais / c.resolvidos) * 10) / 10 : 0;

      return {
        id: c.id,
        posicao: index + 1,
        nome: c.nome,
        papel: c.papel,
        fotoUrl: c.fotoUrl,
        avatarBg: "",
        avatarTexto: c.nome.substring(0, 2).toUpperCase(),
        resolvidos: c.resolvidos,
        abertos: c.abertos,
        total: c.total,
        pctResolvidos,
        pctAbertos,
        tempoMedioDias,
      };
    });

  const topMotivos = Object.values(contagemMotivos)
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
    .map((m) => ({
      codigo: m.codigo,
      nome: m.nome,
      total: m.total,
    }));

  const mediaGeralDias =
    totalConcluidosGeral > 0 ? Math.round((somaDiasGeral / totalConcluidosGeral) * 10) / 10 : 0;

  const tempoMedioPorMotivo = Object.values(contagemMotivos)
    .filter((m) => m.concluidos >= 3)
    .map((m) => ({
      motivo: m.codigo,
      nome: m.nome,
      dias: Math.round((m.diasTotais / m.concluidos) * 10) / 10,
      concluidos: m.concluidos,
    }))
    .sort((a, b) => b.dias - a.dias)
    .slice(0, 8);

  let motivoMaisDemorado: { nome: string; fatorMultiplicador: number } | undefined;
  if (tempoMedioPorMotivo.length > 0 && mediaGeralDias > 0) {
    const primeiro = tempoMedioPorMotivo[0];
    if (primeiro && primeiro.dias > mediaGeralDias) {
      motivoMaisDemorado = {
        nome: primeiro.nome,
        fatorMultiplicador: Math.round((primeiro.dias / mediaGeralDias) * 10) / 10,
      };
    }
  }

  const mesesMap: Record<string, { total: number; concluidos: number; noPrazo: number }> = {};
  for (let i = 11; i >= 0; i--) {
    const d = subMonths(hoje, i);
    const chaveMes = format(d, "MMM/yy", { locale: ptBR });
    mesesMap[chaveMes] = { total: 0, concluidos: 0, noPrazo: 0 };
  }

  for (const c of dadosBanco.chamados12m) {
    const d = new Date(c.data_solicitacao);
    const chaveMes = format(d, "MMM/yy", { locale: ptBR });
    if (mesesMap[chaveMes]) {
      mesesMap[chaveMes].total++;
      if (c.situacao === "concluido") {
        mesesMap[chaveMes].concluidos++;
        if (c.data_conclusao && new Date(c.data_conclusao) <= new Date(c.prazo)) {
          mesesMap[chaveMes].noPrazo++;
        }
      }
    }
  }

  const volumeMensal = Object.entries(mesesMap).map(([mes, stats]) => ({
    mes,
    total: stats.total,
    concluidos: stats.concluidos,
    pendencia: Math.max(0, stats.total - stats.concluidos),
  }));

  const taxaPrazoMensal = Object.entries(mesesMap).map(([mes, stats]) => ({
    mes,
    taxa: stats.concluidos > 0 ? Math.round((stats.noPrazo / stats.concluidos) * 100) : null,
    totalResolvidos: stats.concluidos,
  }));

  const dadosDashboard = {
    totais: {
      total,
      aguardando,
      concluidos,
      encerrados,
      vencidos,
      vencendo_em_2_dias,
    },
    fila: {
      aguardando,
      concluidos,
      encerrados,
      total,
    },
    rankingEquipe,
    volumeMensal,
    topMotivos,
    tempoMedioPorMotivo,
    mediaGeralDias,
    motivoMaisDemorado,
    taxaPrazoMensal,
    chamadosVencidosOuProximos: chamadosCriticos.slice(0, 10),
  };

  const polosFormatados = dadosBanco.polos
    .filter((p: any) => podeVerTodosPolos || p.id === perfilAtual.polo_id)
    .map((p: any) => ({
      id: p.id,
      nome: p.nome,
      codigo: p.codigo,
      cidade: p.cidade,
      estado: p.estado,
      ativo: Boolean(p.ativo),
      criado_em: p.criado_em ? new Date(p.criado_em).toISOString() : new Date().toISOString(),
    }));

  return (
    <PainelDashboard
      dados={dadosDashboard}
      periodoSelecionado={periodo}
      polos={polosFormatados}
      poloSelecionado={poloId}
      perfilAtual={perfilAtual}
    />
  );
}
