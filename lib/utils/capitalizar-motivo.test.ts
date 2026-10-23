import assert from "node:assert/strict";
import { test } from "node:test";
import { capitalizarMotivo } from "./capitalizar-motivo";

test("padroniza nomes em maiúsculas, minúsculas e escrita mista", () => {
  for (const entrada of [
    "PAGAMENTO EM DUPLICIDADE",
    "pagamento em duplicidade",
    "Pagamento em DUPLICIDADE",
  ]) {
    assert.equal(capitalizarMotivo(entrada), "Pagamento Em Duplicidade");
  }
});

test("preserva acentos, números e separadores", () => {
  assert.equal(capitalizarMotivo("EMISSÃO DE BOLETO"), "Emissão De Boleto");
  assert.equal(capitalizarMotivo("CONTRATO 2º VIA"), "Contrato 2º Via");
  assert.equal(capitalizarMotivo("CONSUMO DE CUPOM/CRÉDITO"), "Consumo De Cupom/Crédito");
  assert.equal(capitalizarMotivo("SOLICITAÇÃO - REMATRÍCULA"), "Solicitação - Rematrícula");
});

test("normaliza espaços e acentos decompostos de forma idempotente", () => {
  assert.equal(capitalizarMotivo("  EMISSA\u0303O   DE\nBOLETO  "), "Emissão De Boleto");
  const nome = "Data De Vencimento Incorreta";
  assert.equal(capitalizarMotivo(capitalizarMotivo(nome)), nome);
  assert.equal(capitalizarMotivo(""), "");
});
