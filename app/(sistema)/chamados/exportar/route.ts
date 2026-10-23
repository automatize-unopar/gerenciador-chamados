import { chamadoEstaAberto } from "@/lib/chamados/situacao";
import { type NextRequest, NextResponse } from "next/server";
import { format, startOfDay, differenceInCalendarDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { obterPerfilAtual } from "@/lib/auth/perfil";
import { comUsuario } from "@/lib/db/comUsuario";
import { sql } from "@/lib/db/pool";
import { formatarCpf } from "@/lib/utils/cpf";

export async function GET(request: NextRequest) {
  const perfil = await obterPerfilAtual();
  const searchParams = request.nextUrl.searchParams;

  const chamados = await comUsuario({ usuario_id: perfil.id, papel: perfil.papel }, async (req) => {
    let whereClause = "WHERE c.excluido_em IS NULL";

    const busca = searchParams.get("busca");
    if (busca && busca.trim() !== "") {
      const limpo = busca.trim();
      const apenasDigitos = limpo.replace(/\D/g, "");
      if (apenasDigitos.length === 11) {
        req.input("buscaCpfExato", sql.VarChar(11), apenasDigitos);
        whereClause += " AND c.aluno_cpf = @buscaCpfExato";
      } else {
        req.input("busca", sql.VarChar(255), `%${limpo}%`);
        req.input("buscaPrefixo", sql.VarChar(50), `${limpo}%`);
        whereClause +=
          " AND (c.protocolo LIKE @buscaPrefixo OR c.aluno_nome LIKE @busca OR c.aluno_ra LIKE @busca)";
      }
    }

    const situacao = searchParams.get("situacao");
    if (situacao && situacao !== "todos") {
      req.input("situacao", sql.VarChar(30), situacao);
      whereClause += " AND c.situacao = @situacao";
    }

    const prioridade = searchParams.get("prioridade");
    if (prioridade && prioridade !== "todos") {
      req.input("prioridade", sql.VarChar(20), prioridade);
      whereClause += " AND c.prioridade = @prioridade";
    }

    const motivoId = searchParams.get("motivo_id");
    if (motivoId && motivoId !== "todos") {
      req.input("motivo_id", sql.VarChar(50), motivoId);
      whereClause += " AND c.motivo_id = @motivo_id";
    }

    const poloId = searchParams.get("polo_id");
    if (poloId && poloId !== "todos") {
      req.input("polo_id", sql.VarChar(50), poloId);
      whereClause += " AND c.polo_id = @polo_id";
    }

    const dataInicio = searchParams.get("data_inicio");
    if (dataInicio) {
      req.input("data_inicio", sql.DateTimeOffset, new Date(dataInicio));
      whereClause += " AND c.data_solicitacao >= @data_inicio";
    }

    const dataFim = searchParams.get("data_fim");
    if (dataFim) {
      req.input("data_fim", sql.DateTimeOffset, new Date(dataFim + "T23:59:59.999Z"));
      whereClause += " AND c.data_solicitacao <= @data_fim";
    }

    const q = await req.query(`
        SELECT 
          c.protocolo,
          c.aluno_nome,
          c.aluno_cpf,
          c.aluno_ra,
          pol.nome AS polo_nome,
          pol.cidade AS polo_cidade,
          c.contato_telefone,
          c.situacao,
          c.prioridade,
          c.data_solicitacao,
          c.prazo,
          c.data_conclusao,
          c.descricao,
          c.observacao,
          m.codigo AS motivo_codigo,
          m.nome AS motivo_nome,
          p.nome_completo AS criador_nome
        FROM dados.chamados c
        LEFT JOIN dados.polos pol ON pol.id = c.polo_id
        LEFT JOIN dados.motivos m ON m.id = c.motivo_id
        LEFT JOIN dados.perfis p ON p.id = c.criado_por
        ${whereClause}
        ORDER BY c.data_solicitacao DESC
      `);

    return q.recordset;
  });

  const cabecalho = [
    "Protocolo",
    "Aluno",
    "CPF",
    "RA",
    "Polo",
    "Cidade",
    "Telefone",
    "Código Motivo",
    "Motivo",
    "Situação",
    "Prioridade",
    "Data Solicitação",
    "Prazo",
    "Data Conclusão",
    "Responsável",
    "Descrição",
    "Observação",
  ];

  const escapeCSV = (val?: string | null) => {
    if (val === undefined || val === null) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const filtroPrazo = searchParams.get("filtro_prazo");
  const hoje = startOfDay(new Date());

  const chamadosFiltrados = chamados.filter((c: any) => {
    if (!filtroPrazo || filtroPrazo === "todos") return true;
    if (filtroPrazo === "pendentes") return chamadoEstaAberto(c.situacao);
    if (!chamadoEstaAberto(c.situacao)) return false;
    const diff = differenceInCalendarDays(startOfDay(new Date(c.prazo)), hoje);
    if (filtroPrazo === "vencidos") return diff < 0;
    if (filtroPrazo === "vence_hoje") return diff === 0;
    if (filtroPrazo === "vence_2dias") return diff === 1 || diff === 2;
    return true;
  });

  const linhas = chamadosFiltrados.map((c: any) => [
    escapeCSV(c.protocolo),
    escapeCSV(c.aluno_nome),
    escapeCSV(c.aluno_cpf ? formatarCpf(c.aluno_cpf) : ""),
    escapeCSV(c.aluno_ra || ""),
    escapeCSV(c.polo_nome || ""),
    escapeCSV(c.polo_cidade || ""),
    escapeCSV(c.contato_telefone || ""),
    escapeCSV(c.motivo_codigo || ""),
    escapeCSV(c.motivo_nome || ""),
    escapeCSV(c.situacao),
    escapeCSV(c.prioridade),
    escapeCSV(
      c.data_solicitacao ? format(new Date(c.data_solicitacao), "dd/MM/yyyy", { locale: ptBR }) : ""
    ),
    escapeCSV(c.prazo ? format(new Date(c.prazo), "dd/MM/yyyy", { locale: ptBR }) : ""),
    escapeCSV(
      c.data_conclusao ? format(new Date(c.data_conclusao), "dd/MM/yyyy", { locale: ptBR }) : ""
    ),
    escapeCSV(c.criador_nome || ""),
    escapeCSV(c.descricao || ""),
    escapeCSV(c.observacao || ""),
  ]);

  const csvContent =
    "\uFEFF" + [cabecalho.join(";"), ...linhas.map((l: any) => l.join(";"))].join("\r\n");

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="chamados_${format(new Date(), "yyyyMMdd_HHmmss")}.csv"`,
    },
  });
}
