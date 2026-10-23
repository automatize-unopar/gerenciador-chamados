import assert from "node:assert/strict";
import { test } from "node:test";
import { lerCamposAlterados, lerObjetoAuditoria, dataIsoOuNull } from "./historico";
import { chamadoEstaAberto, SITUACOES_CHAMADO, ROTULOS_SITUACAO } from "./situacao";

test("histórico aceita campos SQL em JSON, lista ou texto separado por vírgulas", () => {
  assert.deepEqual(lerCamposAlterados('["situacao","observacao"]'), ["situacao", "observacao"]);
  assert.deepEqual(lerCamposAlterados(["prazo", null, 1]), ["prazo"]);
  assert.deepEqual(lerCamposAlterados("situacao, observacao"), ["situacao", "observacao"]);
  assert.deepEqual(lerCamposAlterados(null), []);
  assert.deepEqual(lerCamposAlterados(""), []);
});

test("JSON de auditoria inválido não interrompe os detalhes", () => {
  assert.deepEqual(lerObjetoAuditoria('{"situacao":"escalonado"}'), { situacao: "escalonado" });
  assert.equal(lerObjetoAuditoria("JSON truncado {"), null);
  assert.equal(lerObjetoAuditoria("null"), null);
  assert.equal(lerObjetoAuditoria("[]"), null);
});

test("datas de chamados vinculados são serializadas e datas inválidas são rejeitadas", () => {
  assert.equal(dataIsoOuNull(new Date("2026-10-23T12:00:00Z")), "2026-10-23T12:00:00.000Z");
  assert.equal(dataIsoOuNull("invalida"), null);
  assert.equal(dataIsoOuNull(null), null);
});

test("escalonado permanece aberto e não finaliza o SLA", () => {
  assert.ok(SITUACOES_CHAMADO.includes("escalonado"));
  assert.equal(ROTULOS_SITUACAO.escalonado, "Escalonado");
  assert.equal(chamadoEstaAberto("escalonado"), true);
  assert.equal(chamadoEstaAberto("aguardando"), true);
  for (const situacao of ["rascunho", "concluido", "encerrado"]) {
    assert.equal(chamadoEstaAberto(situacao), false);
  }
});
