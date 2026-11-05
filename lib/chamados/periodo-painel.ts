const PERIODOS = ["todos", "mes_atual", "semestre_atual", "ultimos_12_meses"] as const;
type SelecaoPeriodo = (typeof PERIODOS)[number];

export function obterPeriodoPainel(selecao: string | undefined, hoje: string) {
  const periodo: SelecaoPeriodo = PERIODOS.includes(selecao as SelecaoPeriodo)
    ? (selecao as SelecaoPeriodo)
    : "todos";
  if (periodo === "todos") {
    return { selecao: periodo, inicio: null, fimExclusivo: null, rotulo: "Todo o histórico" };
  }

  const data = new Date(`${hoje}T12:00:00Z`);
  const ano = data.getUTCFullYear();
  const mes = data.getUTCMonth();
  const iso = (a: number, m: number) => new Date(Date.UTC(a, m, 1)).toISOString().slice(0, 10);
  if (periodo === "mes_atual") {
    return {
      selecao: periodo,
      inicio: iso(ano, mes),
      fimExclusivo: iso(ano, mes + 1),
      rotulo: data.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }),
    };
  }
  if (periodo === "semestre_atual") {
    const primeiroMes = mes < 6 ? 0 : 6;
    return {
      selecao: periodo,
      inicio: iso(ano, primeiroMes),
      fimExclusivo: iso(ano, primeiroMes + 6),
      rotulo: `${mes < 6 ? "1º" : "2º"} semestre de ${ano}`,
    };
  }
  return {
    selecao: periodo,
    inicio: iso(ano, mes - 11),
    fimExclusivo: new Date(Date.UTC(ano, mes, data.getUTCDate() + 1)).toISOString().slice(0, 10),
    rotulo: "Últimos 12 meses",
  };
}
