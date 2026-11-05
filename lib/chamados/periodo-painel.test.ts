import assert from "node:assert/strict";
import { test } from "node:test";
import { obterPeriodoPainel } from "./periodo-painel";

test("painel abre em todo o histórico sem restringir datas", () => {
  assert.deepEqual(obterPeriodoPainel(undefined, "2026-11-05"), {
    selecao: "todos",
    inicio: null,
    fimExclusivo: null,
    rotulo: "Todo o histórico",
  });
});

test("mês atual inclui o último dia inteiro e exclui o mês seguinte", () => {
  const periodo = obterPeriodoPainel("mes_atual", "2026-11-05");
  assert.equal(periodo.inicio, "2026-11-01");
  assert.equal(periodo.fimExclusivo, "2026-12-01");
});

test("períodos funcionam na virada do ano e nos dois semestres", () => {
  assert.equal(obterPeriodoPainel("mes_atual", "2026-12-05").fimExclusivo, "2027-01-01");
  assert.equal(obterPeriodoPainel("semestre_atual", "2026-05-05").fimExclusivo, "2026-07-01");
  assert.equal(obterPeriodoPainel("semestre_atual", "2026-11-05").inicio, "2026-07-01");
  assert.equal(obterPeriodoPainel("ultimos_12_meses", "2026-01-05").inicio, "2025-02-01");
});

test("todos e parâmetro inválido mantêm todo o histórico", () => {
  assert.equal(obterPeriodoPainel("todos", "2026-11-05").inicio, null);
  assert.equal(obterPeriodoPainel("invalido", "2026-11-05").selecao, "todos");
});
