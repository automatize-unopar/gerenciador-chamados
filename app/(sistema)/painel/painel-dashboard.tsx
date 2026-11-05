"use client";

import { useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  ArrowRight,
  Award,
  X,
  Search,
  Plus,
  Ticket,
  Clock,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Percent,
} from "lucide-react";
import { format, parseISO } from "date-fns";

import { type Polo, type Perfil } from "@/types/database";
import { CustomSelect, type CustomSelectOption } from "@/components/ui/custom-select";
import { AvatarUsuario } from "@/components/ui/avatar-usuario";

interface RankingResponsavelItem {
  id: string;
  posicao: number;
  nome: string;
  papel: string;
  avatarBg: string;
  avatarTexto: string;
  fotoUrl?: string;
  resolvidos: number;
  abertos: number;
  total: number;
  pctResolvidos: number;
  pctAbertos: number;
  tempoMedioDias: number;
}

interface DashboardData {
  totais: {
    total: number;
    aguardando: number;
    concluidos: number;
    encerrados: number;
    vencidos: number;
    vencendo_em_2_dias: number;
  };
  fila: {
    aguardando: number;
    concluidos: number;
    encerrados: number;
    total: number;
  };
  rankingEquipe: RankingResponsavelItem[];
  volumeMensal: { mes: string; total: number; concluidos: number; pendencia: number }[];
  topMotivos: { nome: string; codigo: string; total: number }[];
  tempoMedioPorMotivo: { motivo: string; nome: string; dias: number; concluidos: number }[];
  mediaGeralDias: number;
  motivoMaisDemorado?: { nome: string; fatorMultiplicador: number };
  taxaPrazoMensal: { mes: string; taxa: number | null; totalResolvidos: number }[];
  chamadosVencidosOuProximos: {
    id: string;
    protocolo: string;
    aluno_nome: string;
    prazo: string;
    status: "vencido" | "vencendo_em_2_dias";
    atendente: string;
  }[];
}

interface PainelDashboardProps {
  dados: DashboardData;
  periodoSelecionado: string;
  periodoRotulo: string;
  polos?: Polo[];
  poloSelecionado?: string;
  perfilAtual?: Perfil;
}

type TipoIndicador =
  "total" | "aguardando" | "concluidos" | "taxa" | "vencidos" | "vencendo" | null;

export function PainelDashboard({
  dados,
  periodoSelecionado,
  periodoRotulo,
  polos = [],
  poloSelecionado = "todos",
  perfilAtual,
}: PainelDashboardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [periodo, setPeriodo] = useState(periodoSelecionado);
  const [poloId, setPoloId] = useState(poloSelecionado);
  const [indicadorAtivo, setIndicadorAtivo] = useState<TipoIndicador>(null);
  const [buscaModal, setBuscaModal] = useState("");
  const podeVerTodosPolos = perfilAtual?.papel === "admin" || perfilAtual?.papel === "coordenador";

  const opcoesPolo: CustomSelectOption[] = podeVerTodosPolos
    ? [
        { value: "todos", label: "Todos os Polos (Consolidado)" },
        ...polos.map((p) => ({
          value: p.id,
          label: `${p.nome} (${p.cidade})`,
        })),
      ]
    : polos.map((p) => ({
        value: p.id,
        label: `${p.nome} (${p.cidade})`,
      }));

  const mudarPeriodo = (novoPeriodo: string) => {
    setPeriodo(novoPeriodo);
    const params = new URLSearchParams(searchParams.toString());
    params.set("periodo", novoPeriodo);
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const mudarPolo = (novoPolo: string) => {
    if (!podeVerTodosPolos) return;
    setPoloId(novoPolo);
    const params = new URLSearchParams(searchParams.toString());
    if (novoPolo !== "todos") {
      params.set("polo_id", novoPolo);
    } else {
      params.delete("polo_id");
    }
    startTransition(() => {
      router.push(`${pathname}?${params.toString()}`);
    });
  };

  const totalVolume12m = dados.volumeMensal.reduce((acc, curr) => acc + curr.total, 0);
  const taxaGeralResolucao =
    dados.totais.total > 0 ? Math.round((dados.totais.concluidos / dados.totais.total) * 100) : 0;

  // Montagem da Lista de Ranking com Cores de Destaque
  const listaRankingExibicao = dados.rankingEquipe.map((colab, idx) => ({
    ...colab,
    fotoUrl: colab.fotoUrl || undefined,
    corCard:
      colab.posicao === 1
        ? "border-emerald-500/50 bg-gradient-to-r from-emerald-500/15 via-superficie to-superficie shadow-sm"
        : colab.posicao === 2
          ? "border-sky-500/50 bg-gradient-to-r from-sky-500/15 via-superficie to-superficie shadow-sm"
          : colab.posicao === 3
            ? "border-amber-500/50 bg-gradient-to-r from-amber-500/15 via-superficie to-superficie shadow-sm"
            : "border-purple-500/40 bg-gradient-to-r from-purple-500/10 via-superficie to-superficie shadow-sm",
    avatarBg:
      idx % 3 === 0
        ? "bg-emerald-600 text-white"
        : idx % 3 === 1
          ? "bg-sky-600 text-white"
          : "bg-amber-600 text-white",
  }));

  // Filtragem dos chamados para exibição no modal
  const obterDadosModal = () => {
    let titulo = "";
    let subtitulo = "";
    let linkVerTodos = "/chamados";
    let listaFiltrada = dados.chamadosVencidosOuProximos;

    switch (indicadorAtivo) {
      case "total":
        titulo = "Total de Chamados no Período";
        subtitulo = `${dados.totais.total} chamado(s) registrado(s) no período selecionado.`;
        linkVerTodos = "/chamados";
        break;
      case "aguardando":
        titulo = "Chamados Aguardando Atendimento";
        subtitulo = `${dados.totais.aguardando} chamado(s) em andamento na fila.`;
        linkVerTodos = "/chamados?situacao=aguardando";
        break;
      case "concluidos":
        titulo = "Chamados Concluídos (Resolvidos)";
        subtitulo = `${dados.totais.concluidos} chamado(s) resolvidos com sucesso no período.`;
        linkVerTodos = "/chamados?situacao=concluido";
        break;
      case "taxa":
        titulo = "Taxa de Resolução de Chamados";
        subtitulo = `${taxaGeralResolucao}% de eficiência na resolução global de demandas.`;
        linkVerTodos = "/desempenho";
        break;
      case "vencidos":
        titulo = "Chamados Vencidos em Aberto";
        subtitulo = `${dados.totais.vencidos} chamado(s) com prazo estipulado expirado.`;
        linkVerTodos = "/chamados?situacao=aguardando";
        listaFiltrada = dados.chamadosVencidosOuProximos.filter((c) => c.status === "vencido");
        break;
      case "vencendo":
        titulo = "Chamados Vencendo em até 2 Dias";
        subtitulo = `${dados.totais.vencendo_em_2_dias} chamado(s) prioritários vencendo em breve.`;
        linkVerTodos = "/chamados?situacao=aguardando";
        listaFiltrada = dados.chamadosVencidosOuProximos.filter(
          (c) => c.status === "vencendo_em_2_dias"
        );
        break;
      default:
        break;
    }

    if (buscaModal.trim()) {
      const termo = buscaModal.toLowerCase();
      listaFiltrada = listaFiltrada.filter(
        (c) =>
          c.protocolo.toLowerCase().includes(termo) ||
          c.aluno_nome.toLowerCase().includes(termo) ||
          (c.atendente && c.atendente.toLowerCase().includes(termo))
      );
    }

    return { titulo, subtitulo, linkVerTodos, listaFiltrada };
  };

  const modalInfo = obterDadosModal();

  return (
    <div className="space-y-6">
      {/* 1. Cabeçalho Padronizado da Página e Barra de Filtros */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3 pb-3 border-b border-borda/40">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-texto">
            Painel de Indicadores
          </h1>
          <p className="text-xs text-texto-suave mt-0.5">
            Métricas operacionais de atendimento, produtividade, cumprimento de prazos e motivos.
          </p>
          <p className="text-xs text-texto-suave mt-1">Período: {periodoRotulo}</p>
        </div>

        {/* Barra de Filtros Unificada e Perfeitamente Alinhada */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          {podeVerTodosPolos ? (
            polos.length > 0 && (
              <div className="w-56 shrink-0">
                <CustomSelect
                  options={opcoesPolo}
                  value={poloId}
                  onChange={(val) => mudarPolo(val)}
                />
              </div>
            )
          ) : (
            <div className="inline-flex h-9 items-center gap-1.5 px-3 rounded-lg border border-borda bg-superficie text-xs font-semibold text-texto shrink-0 shadow-2xs">
              <span className="text-texto-suave font-normal">Polo:</span>
              <span>{opcoesPolo[0]?.label || perfilAtual?.polo_nome || "Meu Polo"}</span>
            </div>
          )}

          {/* Segmented Control de Período Compacto */}
          <div className="inline-flex min-h-9 max-w-full flex-wrap items-center rounded-lg border border-borda bg-fundo p-1 shadow-2xs">
            <button
              type="button"
              onClick={() => mudarPeriodo("todos")}
              className={`h-7 px-3 rounded-md text-xs font-semibold transition-all ${
                periodo === "todos"
                  ? "bg-acento text-white shadow-xs"
                  : "text-texto-suave hover:text-texto"
              }`}
            >
              Todo o histórico
            </button>
            <button
              type="button"
              onClick={() => mudarPeriodo("mes_atual")}
              className={`h-7 px-3 rounded-md text-xs font-semibold transition-all ${
                periodo === "mes_atual"
                  ? "bg-acento text-white shadow-xs"
                  : "text-texto-suave hover:text-texto"
              }`}
            >
              Mês atual
            </button>
            <button
              type="button"
              onClick={() => mudarPeriodo("semestre_atual")}
              className={`h-7 px-3 rounded-md text-xs font-semibold transition-all ${
                periodo === "semestre_atual"
                  ? "bg-acento text-white shadow-xs"
                  : "text-texto-suave hover:text-texto"
              }`}
            >
              Semestre letivo
            </button>
            <button
              type="button"
              onClick={() => mudarPeriodo("ultimos_12_meses")}
              className={`h-7 px-3 rounded-md text-xs font-semibold transition-all ${
                periodo === "ultimos_12_meses"
                  ? "bg-acento text-white shadow-xs"
                  : "text-texto-suave hover:text-texto"
              }`}
            >
              12 meses
            </button>
          </div>
        </div>
      </div>

      {/* Perfil do Usuário Conectado */}
      {perfilAtual && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl border border-borda/80 bg-gradient-to-r from-superficie via-superficie to-azul-primario/5 shadow-2xs">
          <div className="flex items-center gap-3.5">
            <AvatarUsuario
              nome={perfilAtual.nome_completo}
              fotoUrl={perfilAtual.avatar_url}
              tamanho="xl"
              indicadorStatus
              statusOnline
            />
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-bold text-texto tracking-tight">
                  {perfilAtual.nome_completo}
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold tracking-wide uppercase ${
                    perfilAtual.papel === "admin"
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-950/60 dark:text-purple-300 border border-purple-200 dark:border-purple-800"
                      : perfilAtual.papel === "coordenador"
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                        : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                  }`}
                >
                  {perfilAtual.papel === "admin"
                    ? "Administrador"
                    : perfilAtual.papel === "coordenador"
                      ? "Coordenador"
                      : "Atendimento"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 text-xs text-texto-suave">
                <span>{perfilAtual.email}</span>
                {perfilAtual.polo_nome && (
                  <>
                    <span className="opacity-40">•</span>
                    <span>
                      {perfilAtual.polo_nome}
                      {perfilAtual.polo_cidade ? ` (${perfilAtual.polo_cidade})` : ""}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/perfil"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg border border-borda bg-superficie hover:bg-fundo text-xs font-semibold text-texto transition shadow-2xs"
            >
              Meu Perfil
            </Link>
            <Link
              href="/chamados/novo"
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-acento hover:bg-acento/90 text-xs font-semibold text-white transition shadow-xs"
            >
              <Plus className="h-3.5 w-3.5" />
              Novo Chamado
            </Link>
          </div>
        </div>
      )}

      {/* 2. Cartões de Indicadores Principais Alinhados e Compactos */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {/* Total no período */}
        <div
          onClick={() => {
            setBuscaModal("");
            setIndicadorAtivo("total");
          }}
          className="group cursor-pointer rounded-xl border border-borda bg-superficie p-3.5 transition-all hover:border-sky-500/50 hover:bg-superficie/80 hover:shadow-xs space-y-1.5"
          title="Clique para detalhar chamados registrados"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-texto-suave truncate">Total geral</span>
            <div className="h-6 w-6 rounded-md bg-sky-500/10 text-sky-500 flex items-center justify-center shrink-0">
              <Ticket className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold tracking-tight text-texto tabular-nums">
              {dados.totais.total}
            </span>
          </div>
          <p className="text-[11px] text-texto-suave truncate">Registrados no período</p>
        </div>

        {/* Aguardando */}
        <div
          onClick={() => {
            setBuscaModal("");
            setIndicadorAtivo("aguardando");
          }}
          className="group cursor-pointer rounded-xl border border-borda bg-superficie p-3.5 transition-all hover:border-amber-500/50 hover:bg-superficie/80 hover:shadow-xs space-y-1.5"
          title="Clique para detalhar chamados aguardando"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-texto-suave truncate">Aguardando</span>
            <div className="h-6 w-6 rounded-md bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <Clock className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold tracking-tight text-amber-500 tabular-nums">
              {dados.totais.aguardando}
            </span>
          </div>
          <p className="text-[11px] text-texto-suave truncate">Fila em andamento</p>
        </div>

        {/* Concluídos */}
        <div
          onClick={() => {
            setBuscaModal("");
            setIndicadorAtivo("concluidos");
          }}
          className="group cursor-pointer rounded-xl border border-borda bg-superficie p-3.5 transition-all hover:border-emerald-500/50 hover:bg-superficie/80 hover:shadow-xs space-y-1.5"
          title="Clique para detalhar chamados concluídos"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-texto-suave truncate">Concluídos</span>
            <div className="h-6 w-6 rounded-md bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <CheckCircle2 className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold tracking-tight text-emerald-500 tabular-nums">
              {dados.totais.concluidos}
            </span>
          </div>
          <p className="text-[11px] text-texto-suave truncate">Resolvidos com sucesso</p>
        </div>

        {/* Taxa de resolução */}
        <div
          onClick={() => {
            setBuscaModal("");
            setIndicadorAtivo("taxa");
          }}
          className="group cursor-pointer rounded-xl border border-borda bg-superficie p-3.5 transition-all hover:border-blue-500/50 hover:bg-superficie/80 hover:shadow-xs space-y-1.5"
          title="Clique para detalhar taxa de resolução"
        >
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-texto-suave truncate">Taxa global</span>
            <div className="h-6 w-6 rounded-md bg-blue-500/10 text-blue-500 flex items-center justify-center shrink-0">
              <Percent className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl font-bold tracking-tight text-texto tabular-nums">
              {dados.totais.total > 0 ? `${taxaGeralResolucao}%` : "—"}
            </span>
          </div>
          <p className="text-[11px] text-texto-suave truncate">Meta global: 90%</p>
        </div>

        {/* Vencidos em aberto */}
        <div
          onClick={() => {
            setBuscaModal("");
            setIndicadorAtivo("vencidos");
          }}
          className={`group cursor-pointer rounded-xl border p-3.5 transition-all hover:shadow-xs space-y-1.5 ${
            dados.totais.vencidos > 0
              ? "border-red-500/30 bg-red-500/5 hover:border-red-500/60 hover:bg-red-500/10"
              : "border-borda bg-superficie hover:border-borda/80"
          }`}
          title="Clique para detalhar chamados vencidos"
        >
          <div className="flex items-center justify-between text-xs">
            <span
              className={`font-semibold truncate ${
                dados.totais.vencidos > 0 ? "text-red-500" : "text-texto-suave"
              }`}
            >
              Vencidos
            </span>
            <div
              className={`h-6 w-6 rounded-md flex items-center justify-center shrink-0 ${
                dados.totais.vencidos > 0
                  ? "bg-red-500/15 text-red-500"
                  : "bg-fundo text-texto-suave"
              }`}
            >
              <AlertOctagon className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-2xl font-bold tracking-tight tabular-nums ${
                dados.totais.vencidos > 0 ? "text-red-500" : "text-texto"
              }`}
            >
              {dados.totais.vencidos}
            </span>
          </div>
          <p
            className={`text-[11px] truncate ${
              dados.totais.vencidos > 0 ? "text-red-500/80" : "text-texto-suave"
            }`}
          >
            Prazo expirado
          </p>
        </div>

        {/* Vencendo em 2 dias */}
        <div
          onClick={() => {
            setBuscaModal("");
            setIndicadorAtivo("vencendo");
          }}
          className={`group cursor-pointer rounded-xl border p-3.5 transition-all hover:shadow-xs space-y-1.5 ${
            dados.totais.vencendo_em_2_dias > 0
              ? "border-amber-500/30 bg-amber-500/5 hover:border-amber-500/60 hover:bg-amber-500/10"
              : "border-borda bg-superficie hover:border-borda/80"
          }`}
          title="Clique para detalhar chamados a vencer logo"
        >
          <div className="flex items-center justify-between text-xs">
            <span
              className={`font-semibold truncate ${
                dados.totais.vencendo_em_2_dias > 0 ? "text-amber-500" : "text-texto-suave"
              }`}
            >
              Vencem logo
            </span>
            <div
              className={`h-6 w-6 rounded-md flex items-center justify-center shrink-0 ${
                dados.totais.vencendo_em_2_dias > 0
                  ? "bg-amber-500/15 text-amber-500"
                  : "bg-fundo text-texto-suave"
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
            </div>
          </div>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-2xl font-bold tracking-tight tabular-nums ${
                dados.totais.vencendo_em_2_dias > 0 ? "text-amber-500" : "text-texto"
              }`}
            >
              {dados.totais.vencendo_em_2_dias}
            </span>
          </div>
          <p
            className={`text-[11px] truncate ${
              dados.totais.vencendo_em_2_dias > 0 ? "text-amber-500/80" : "text-texto-suave"
            }`}
          >
            Em até 2 dias
          </p>
        </div>
      </div>

      {/* Modal Interativo de Detalhamento do Indicador */}
      {indicadorAtivo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-2xl rounded-2xl border border-borda bg-superficie p-5 space-y-4 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-start justify-between border-b border-borda pb-3">
              <div>
                <h3 className="text-base font-bold text-texto">{modalInfo.titulo}</h3>
                <p className="text-xs text-texto-suave mt-0.5">{modalInfo.subtitulo}</p>
              </div>
              <button
                type="button"
                onClick={() => setIndicadorAtivo(null)}
                className="text-texto-suave hover:text-texto rounded-md p-1"
                title="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Listagem de Itens Críticos quando houver */}
            {modalInfo.listaFiltrada.length > 0 ? (
              <div className="space-y-3 flex-1 overflow-y-auto">
                <div className="relative">
                  <input
                    type="text"
                    value={buscaModal}
                    onChange={(e) => setBuscaModal(e.target.value)}
                    placeholder="Buscar por protocolo, aluno ou responsável..."
                    className="w-full rounded-lg border border-borda bg-fundo pl-9 pr-3 py-2 text-xs text-texto placeholder:text-texto-suave focus:border-acento focus:outline-none"
                  />
                  <Search className="absolute left-3 top-2.5 h-4 w-4 text-texto-suave" />
                </div>

                <div className="divide-y divide-borda rounded-lg border border-borda bg-fundo">
                  {modalInfo.listaFiltrada.map((item) => (
                    <div key={item.id} className="p-3 flex items-center justify-between text-xs">
                      <div>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/chamados/${item.id}`}
                            className="font-mono font-semibold text-acento hover:underline"
                          >
                            {item.protocolo}
                          </Link>
                          <span className="font-medium text-texto">{item.aluno_nome}</span>
                        </div>
                        <span className="text-[11px] text-texto-suave block mt-0.5">
                          Responsável: {item.atendente} · Prazo:{" "}
                          {format(parseISO(item.prazo), "dd/MM/yyyy")}
                        </span>
                      </div>
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-semibold ${
                          item.status === "vencido"
                            ? "bg-erro-fundo text-erro border border-erro/30"
                            : "bg-alerta-fundo text-alerta border border-alerta/30"
                        }`}
                      >
                        {item.status === "vencido" ? "Vencido" : "Vence em breve"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center rounded-lg border border-borda bg-fundo p-6 text-center space-y-1">
                <span className="text-xs font-medium text-texto">
                  Consulte a listagem completa no módulo de chamados.
                </span>
                <span className="text-[11px] text-texto-suave">
                  Use os filtros de situação e prazo para refinar os resultados.
                </span>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 border-t border-borda pt-3">
              <button
                type="button"
                onClick={() => setIndicadorAtivo(null)}
                className="h-9 px-4 rounded-lg border border-borda bg-superficie text-xs font-semibold text-texto hover:bg-fundo transition"
              >
                Fechar
              </button>
              <Link
                href={modalInfo.linkVerTodos}
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#1D4ED8] text-xs font-bold text-white hover:bg-blue-600 transition shadow-xs"
              >
                <span>Ver módulo de chamados</span>
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* 3. Ranking de Produtividade: Resolvidos vs. Em Aberto por Responsável (Cards com Fotos e Cores) */}
      <div className="rounded-2xl border border-borda bg-superficie p-6 shadow-sm space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-borda pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Award className="h-5 w-5 text-[#1D4ED8]" />
              <h2 className="text-base font-extrabold text-texto">
                Chamados Resolvidos vs. Em Aberto por Responsável
              </h2>
            </div>
            <p className="text-xs text-texto-suave mt-0.5">
              Volume concluído com resolução comparado a pendências remanescentes na fila.
            </p>
          </div>

          {/* Legenda de Cores da Barra */}
          <div className="flex items-center gap-4 text-xs font-bold bg-fundo px-3.5 py-2 rounded-xl border border-borda">
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-[#1D4ED8]" />
              <span className="text-texto">Resolvidos</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm bg-[#DC2626]" />
              <span className="text-texto">Em aberto</span>
            </div>
          </div>
        </div>

        {/* Lista de Responsáveis com Fotos e Cores Gradientes por Posição */}
        {listaRankingExibicao.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-borda bg-fundo p-6 text-center space-y-2">
            <span className="text-sm font-medium text-texto">
              Nenhum atendimento registrado no período selecionado.
            </span>
            <span className="text-xs text-texto-suave">
              Os atendimentos aparecerão aqui assim que novos chamados forem abertos ou concluídos.
            </span>
            <div className="pt-2">
              <Link
                href="/chamados/novo"
                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-[#1D4ED8] text-xs font-bold text-white hover:bg-blue-600 transition shadow-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Novo Chamado</span>
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-3.5 pt-1">
            {listaRankingExibicao.map((colab) => {
              const ehTop1 = colab.posicao === 1;
              const ehTop2 = colab.posicao === 2;
              const ehTop3 = colab.posicao === 3;

              return (
                <div
                  key={colab.id}
                  className={`flex flex-col gap-3.5 rounded-2xl border-2 p-4 transition-all hover:scale-[1.003] sm:flex-row sm:items-center sm:justify-between ${colab.corCard}`}
                >
                  {/* Lado Esquerdo: Posição, Foto de Perfil e Nome */}
                  <div className="flex items-center gap-3.5 min-w-[260px]">
                    <span className="font-mono text-base font-black text-texto w-8 shrink-0 text-center">
                      #{colab.posicao}
                    </span>

                    {/* Avatar do Colaborador com Sincronização Real e Fallback */}
                    <AvatarUsuario
                      nome={colab.nome}
                      fotoUrl={colab.fotoUrl}
                      tamanho="xl"
                      className="shadow-sm"
                    />

                    <div className="truncate">
                      <div className="text-sm font-bold text-texto truncate" title={colab.nome}>
                        {colab.nome}
                      </div>
                      <div className="text-[11px] font-medium text-texto-suave">{colab.papel}</div>
                    </div>

                    {/* Medalha / Badge de Pódio */}
                    {ehTop1 && (
                      <div
                        className="ml-auto shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-amber-400 text-amber-950 font-black border-2 border-amber-300 shadow-md"
                        title="1º Lugar"
                      >
                        <span className="text-xs">1º</span>
                      </div>
                    )}
                    {ehTop2 && (
                      <div
                        className="ml-auto shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-slate-300 text-slate-800 font-black border-2 border-slate-200 shadow-md"
                        title="2º Lugar"
                      >
                        <span className="text-xs">2º</span>
                      </div>
                    )}
                    {ehTop3 && (
                      <div
                        className="ml-auto shrink-0 flex h-8 w-8 items-center justify-center rounded-full bg-amber-700 text-amber-100 font-black border-2 border-amber-600 shadow-md"
                        title="3º Lugar"
                      >
                        <span className="text-xs">3º</span>
                      </div>
                    )}
                  </div>

                  {/* Lado Direito: Barra Proporcional de Volume e Resolução */}
                  <div className="flex-1 sm:max-w-xl">
                    {(() => {
                      const maxChamadosRanking = Math.max(
                        ...dados.rankingEquipe.map((c) => c.total),
                        1
                      );
                      const larguraRelativa =
                        colab.total > 0 ? (colab.total / maxChamadosRanking) * 100 : 0;

                      return (
                        <div className="relative flex h-10 w-full overflow-hidden rounded-xl border-2 border-white/80 bg-fundo shadow-sm p-1">
                          {colab.total > 0 ? (
                            <div
                              style={{ width: `${Math.max(larguraRelativa, 14)}%` }}
                              className="flex h-full overflow-hidden rounded-lg transition-all duration-500 shadow-xs"
                            >
                              {/* Resolvidos (Azul Cobalto) */}
                              {colab.resolvidos > 0 && (
                                <div
                                  style={{
                                    width: `${(colab.resolvidos / colab.total) * 100}%`,
                                  }}
                                  className="flex items-center justify-between bg-[#1D4ED8] px-2.5 text-white shadow-inner min-w-[34px]"
                                  title={`${colab.resolvidos} resolvidos (${colab.pctResolvidos}%)`}
                                >
                                  <span className="font-mono text-xs font-extrabold tabular-nums">
                                    {colab.resolvidos}
                                  </span>
                                  {colab.pctResolvidos > 0 && (
                                    <span className="text-[10px] font-bold font-mono opacity-90 ml-1">
                                      {colab.pctResolvidos}%
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Em Aberto (Vermelho) */}
                              {colab.abertos > 0 && (
                                <div
                                  style={{
                                    width: `${(colab.abertos / colab.total) * 100}%`,
                                  }}
                                  className="flex items-center justify-between bg-[#DC2626] px-2.5 text-white shadow-inner min-w-[34px]"
                                  title={`${colab.abertos} em aberto (${colab.pctAbertos}%)`}
                                >
                                  <span className="font-mono text-xs font-extrabold tabular-nums">
                                    {colab.abertos}
                                  </span>
                                  {colab.pctAbertos > 0 && (
                                    <span className="text-[10px] font-bold font-mono opacity-90 ml-1">
                                      {colab.pctAbertos}%
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="flex h-full w-full items-center justify-center text-[11px] font-medium text-texto-suave/70 italic">
                              Nenhum chamado no período
                            </div>
                          )}
                        </div>
                      );
                    })()}

                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-texto-suave px-1">
                      <span>
                        Total atribuído:{" "}
                        <strong className="text-texto font-bold">{colab.total}</strong>
                      </span>
                      <span>
                        Tempo médio:{" "}
                        <strong className="text-texto font-bold">{colab.tempoMedioDias}d</strong>
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 4. Gráficos de Volume e Motivos Recorrentes */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Volume de Chamados (12 Meses) */}
        <div className="rounded-2xl border border-borda bg-superficie p-6 shadow-sm space-y-3">
          <div>
            <h2 className="text-sm font-bold text-texto">Volume de Chamados (Últimos 12 Meses)</h2>
            <p className="text-xs text-texto-suave">
              Total de {totalVolume12m} chamados distribuídos mês a mês.
            </p>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={dados.volumeMensal}
                margin={{ top: 10, right: 10, left: -25, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--borda)" opacity={0.6} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--texto-suave)" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--texto-suave)" }} />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="Total"
                  stroke="#1D4ED8"
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="concluidos"
                  name="Concluídos"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Motivos Mais Recorrentes */}
        <div className="rounded-2xl border border-borda bg-superficie p-6 shadow-sm space-y-3">
          <div>
            <h2 className="text-sm font-bold text-texto">Motivos Mais Recorrentes</h2>
            <p className="text-xs text-texto-suave">
              Distribuição por categoria de solicitação acadêmica.
            </p>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dados.topMotivos.slice(0, 5)}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 30, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--borda)" opacity={0.6} />
                <XAxis
                  type="number"
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "var(--texto-suave)" }}
                />
                <YAxis
                  dataKey="codigo"
                  type="category"
                  tick={{ fontSize: 11, fill: "var(--texto-suave)" }}
                />
                <Tooltip formatter={(val, _name, item) => [`${val} chamados`, item.payload.nome]} />
                <Bar dataKey="total" fill="#1D4ED8" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 5. Linha 3 de Gráficos: Gargalos e Cumprimento de Prazos */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Onde os chamados travam? */}
        <div className="rounded-2xl border border-borda bg-superficie p-6 shadow-sm space-y-3">
          <div>
            <h2 className="text-sm font-bold text-texto">Tempo Médio de Atendimento por Motivo</h2>
            <p className="text-xs text-texto-suave">
              Média de dias úteis até a resolução por tipo de protocolo.
            </p>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={dados.tempoMedioPorMotivo}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--borda)" opacity={0.6} />
                <XAxis dataKey="motivo" tick={{ fontSize: 10, fill: "var(--texto-suave)" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "var(--texto-suave)" }} />
                <Tooltip
                  formatter={(val, _name, item) => [
                    `${val} dias (${item.payload.concluidos} concluídos)`,
                    item.payload.nome,
                  ]}
                />
                <ReferenceLine
                  y={2.1}
                  stroke="#D97706"
                  strokeDasharray="3 3"
                  label={{ value: "Média (2.1d)", fill: "#D97706", fontSize: 10 }}
                />
                <Bar dataKey="dias" name="Dias médios" fill="#1D4ED8" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Estamos cumprindo os prazos? */}
        <div className="rounded-2xl border border-borda bg-superficie p-6 shadow-sm space-y-3">
          <div>
            <h2 className="text-sm font-bold text-texto">Cumprimento de Prazos (Meta: 90%)</h2>
            <p className="text-xs text-texto-suave">
              Taxa mensal de chamados concluídos dentro do prazo de 5 dias úteis.
            </p>
          </div>

          <div className="h-56 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={dados.taxaPrazoMensal}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="var(--borda)" opacity={0.6} />
                <XAxis dataKey="mes" tick={{ fontSize: 11, fill: "var(--texto-suave)" }} />
                <YAxis
                  domain={[0, 100]}
                  allowDecimals={false}
                  tick={{ fontSize: 11, fill: "var(--texto-suave)" }}
                />
                <Tooltip formatter={(val) => [val !== null ? `${val}%` : "—", "Taxa no prazo"]} />
                <ReferenceLine
                  y={90}
                  stroke="#10B981"
                  strokeDasharray="4 4"
                  label={{ value: "Meta (90%)", fill: "#10B981", fontSize: 10 }}
                />
                <Line
                  type="monotone"
                  dataKey="taxa"
                  name="Taxa no prazo (%)"
                  stroke="#1D4ED8"
                  strokeWidth={2.5}
                  dot={{ r: 4 }}
                  connectNulls
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 6. Listas Acionáveis: Chamados Críticos */}
      <div className="rounded-2xl border border-borda bg-superficie p-6 shadow-sm space-y-3">
        <div className="flex items-center justify-between border-b border-borda pb-2">
          <div>
            <h2 className="text-sm font-bold text-texto">Chamados que exigem atenção imediata</h2>
            <p className="text-xs text-texto-suave">
              Lista prioritária de protocolos com prazo próximo para conclusão.
            </p>
          </div>
          <Link
            href="/chamados?situacao=aguardando"
            className="text-xs font-bold text-[#1D4ED8] hover:underline flex items-center gap-1"
          >
            <span>Ver todos</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="divide-y divide-borda/60 rounded-xl border border-borda bg-fundo max-h-64 overflow-y-auto">
          {dados.chamadosVencidosOuProximos.length === 0 ? (
            <div className="p-4 text-center text-xs text-texto-suave font-medium">
              Nenhum chamado crítico no momento.
            </div>
          ) : (
            dados.chamadosVencidosOuProximos.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-3 text-xs">
                <div>
                  <Link
                    href={`/chamados/${c.id}`}
                    className="font-mono font-bold text-[#1D4ED8] hover:underline mr-2"
                  >
                    {c.protocolo}
                  </Link>
                  <span className="text-texto font-bold">{c.aluno_nome}</span>
                  <span className="text-[11px] text-texto-suave ml-2 font-medium">
                    ({c.atendente})
                  </span>
                </div>
                <span
                  className={`rounded-lg px-2.5 py-1 font-mono text-[11px] font-bold ${
                    c.status === "vencido"
                      ? "bg-red-500/15 text-red-600 border border-red-500/40"
                      : "bg-orange-500/15 text-orange-600 border border-orange-500/40"
                  }`}
                >
                  {c.status === "vencido" ? "Vencido" : "Vence em breve"} (
                  {format(parseISO(c.prazo), "dd/MM")})
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
