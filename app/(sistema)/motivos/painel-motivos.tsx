"use client";

import { useState } from "react";
import { type Motivo, type Perfil } from "@/types/database";
import {
  salvarMotivoAction,
  alternarStatusMotivoAction,
  verificarSimilaridade,
  type SimilaridadeResultado,
} from "./actions";
import { Tag, Plus, Search, Check, AlertCircle } from "lucide-react";
import { CustomCheckbox } from "@/components/ui/custom-checkbox";

interface PainelMotivosProps {
  motivos: Motivo[];
  perfilAtual: Perfil;
}

export function PainelMotivos({ motivos, perfilAtual }: PainelMotivosProps) {
  const [busca, setBusca] = useState("");
  const [modalAberto, setModalAberto] = useState(false);
  const [motivoEditando, setMotivoEditando] = useState<Motivo | null>(null);

  // Estados do formulário
  const [nome, setNome] = useState("");
  const [filtro, setFiltro] = useState("");
  const [motivosSimilares, setMotivosSimilares] = useState<SimilaridadeResultado[]>([]);
  const [confirmouCriacaoMesmoSimilar, setConfirmouCriacaoMesmoSimilar] = useState(false);

  const [mensagemSucesso, setMensagemSucesso] = useState<string | null>(null);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  const ehAdmin = perfilAtual.papel === "admin";

  const motivosFiltrados = motivos.filter((m) => {
    const termo = busca.toLowerCase();
    return (
      m.nome.toLowerCase().includes(termo) ||
      m.codigo.toLowerCase().includes(termo) ||
      (m.filtro && m.filtro.toLowerCase().includes(termo))
    );
  });

  const handleAbrirCriacao = () => {
    setMotivoEditando(null);
    setNome("");
    setFiltro("");
    setMotivosSimilares([]);
    setConfirmouCriacaoMesmoSimilar(false);
    setMensagemErro(null);
    setModalAberto(true);
  };

  const handleAbrirEdicao = (m: Motivo) => {
    setMotivoEditando(m);
    setNome(m.nome);
    setFiltro(m.filtro || "");
    setMotivosSimilares([]);
    setConfirmouCriacaoMesmoSimilar(false);
    setMensagemErro(null);
    setModalAberto(true);
  };

  const handleVerificarNome = async (valor: string) => {
    setNome(valor);
    if (!motivoEditando && valor.trim().length >= 3) {
      const res = await verificarSimilaridade(valor);
      setMotivosSimilares(res);
    } else {
      setMotivosSimilares([]);
    }
  };

  const handleSalvar = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensagemErro(null);
    setMensagemSucesso(null);

    if (!filtro.trim()) {
      setMensagemErro("Informe o Filtro (Caminho do Motivo).");
      return;
    }

    if (!motivoEditando && motivosSimilares.length > 0 && !confirmouCriacaoMesmoSimilar) {
      setMensagemErro(
        "Atenção: existem motivos muito semelhantes já cadastrados. Revise a lista ou confirme a criação."
      );
      return;
    }

    const formData = new FormData();
    if (motivoEditando) {
      formData.set("id", motivoEditando.id);
    }
    formData.set("nome", nome);
    formData.set("filtro", filtro);
    if (confirmouCriacaoMesmoSimilar) {
      formData.set("confirmacao_forcada", "true");
    }

    const res = await salvarMotivoAction({}, formData);
    if (res.erro) {
      setMensagemErro(res.erro);
      if (res.similares) {
        setMotivosSimilares(res.similares);
      }
    } else if (res.sucesso) {
      setModalAberto(false);
      setMensagemSucesso(
        motivoEditando ? "Motivo atualizado com sucesso." : "Novo motivo cadastrado com sucesso."
      );
    }
  };

  const handleAlternarStatus = async (id: string, ativoAtual: boolean) => {
    setMensagemErro(null);
    const res = await alternarStatusMotivoAction(id, !ativoAtual);
    if (!res.sucesso) {
      setMensagemErro(res.erro || "Falha ao alterar status do motivo.");
    }
  };

  return (
    <div className="space-y-8">
      {/* 1. Cabeçalho Padronizado da Página */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-texto">
            Catálogo de Motivos de Chamados
          </h1>
          <p className="text-sm text-texto-suave mt-0.5">
            Catálogo padronizado de solicitações com prevenção contra duplicidade semântica.
          </p>
        </div>

        <button
          type="button"
          onClick={handleAbrirCriacao}
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-acento text-xs font-semibold text-white hover:bg-acento-hover transition"
        >
          <Plus className="h-4 w-4" />
          <span>Novo Motivo</span>
        </button>
      </div>

      {mensagemSucesso && (
        <div className="flex items-center gap-2 rounded-lg border border-sucesso/40 bg-sucesso-fundo/40 p-4 text-xs font-medium text-sucesso">
          <Check className="h-4 w-4 shrink-0" />
          <span>{mensagemSucesso}</span>
        </div>
      )}

      {mensagemErro && (
        <div className="flex items-start gap-2 rounded-lg border border-erro/40 bg-erro-fundo p-4 text-xs font-medium text-erro">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{mensagemErro}</span>
        </div>
      )}

      {/* 2. Busca */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-2.5 h-4 w-4 text-texto-suave" />
        <input
          type="text"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar motivo por código (#01), nome ou filtro..."
          className="w-full rounded-lg border border-borda bg-superficie pl-9 pr-3 py-2 text-xs font-medium text-texto placeholder:text-texto-suave focus:border-acento focus:outline-none"
        />
      </div>

      {/* 3. Tabela de Motivos */}
      <div className="tabela-scroll overflow-x-auto rounded-xl border border-borda bg-superficie shadow-xs">
        <table className="tabela-densa">
          <thead>
            <tr>
              <th className="w-24">Código</th>
              <th>Nome do Motivo</th>
              <th>Filtro / Caminho</th>
              <th className="w-24 text-center">Status</th>
              {ehAdmin && <th className="w-32 text-right">Ações</th>}
            </tr>
          </thead>
          <tbody>
            {motivosFiltrados.length === 0 ? (
              <tr>
                <td
                  colSpan={ehAdmin ? 5 : 4}
                  className="py-12 text-center text-xs text-texto-suave"
                >
                  Nenhum motivo encontrado.
                </td>
              </tr>
            ) : (
              motivosFiltrados.map((m) => (
                <tr key={m.id}>
                  <td className="font-mono text-xs font-semibold text-acento">{m.codigo}</td>
                  <td className="text-xs font-medium text-texto">{m.nome}</td>
                  <td className="text-xs text-texto-suave">
                    {m.filtro ? (
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] bg-fundo px-2 py-0.5 rounded border border-borda text-texto">
                        {m.filtro}
                      </span>
                    ) : (
                      <span className="text-texto-suave/50 italic text-[11px]">—</span>
                    )}
                  </td>
                  <td className="text-center">
                    <span
                      className={`inline-flex items-center justify-center h-6 px-2.5 rounded text-[11px] font-medium border ${
                        m.ativo
                          ? "bg-sucesso-fundo/40 text-sucesso border-sucesso/30"
                          : "bg-erro-fundo text-erro border-erro/30"
                      }`}
                    >
                      {m.ativo ? "Ativo" : "Inativo"}
                    </span>
                  </td>
                  {ehAdmin && (
                    <td className="text-right">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleAbrirEdicao(m)}
                          className="h-7 px-2.5 rounded border border-borda bg-fundo text-[11px] font-medium text-texto hover:bg-superficie transition"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAlternarStatus(m.id, m.ativo)}
                          className="h-7 px-2.5 rounded border border-borda bg-fundo text-[11px] font-medium text-texto-suave hover:text-texto hover:bg-superficie transition"
                        >
                          {m.ativo ? "Desativar" : "Ativar"}
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Modal de Criação / Edição de Motivo */}
      {modalAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-lg border border-borda bg-superficie p-6 space-y-4 shadow-xl">
            <div className="flex items-center gap-2 border-b border-borda pb-3">
              <Tag className="h-4 w-4 text-acento" />
              <h2 className="text-sm font-semibold text-texto">
                {motivoEditando
                  ? `Editar Motivo ${motivoEditando.codigo}`
                  : "Cadastrar Novo Motivo"}
              </h2>
            </div>

            <form onSubmit={handleSalvar} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-texto mb-1.5">
                  Nome do Motivo *
                </label>
                <input
                  type="text"
                  required
                  value={nome}
                  onChange={(e) => handleVerificarNome(e.target.value)}
                  placeholder="Ex: Correção de nota de prova presencial"
                  className="w-full rounded-lg border border-borda bg-fundo px-3.5 py-2 text-xs font-medium text-texto focus:border-acento focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="filtro-motivo"
                  className="block text-xs font-medium text-texto mb-1"
                >
                  Filtro (Caminho do Motivo) *
                </label>
                <p className="text-[11px] text-texto-suave mb-1.5">
                  Informe o caminho ou categoria da solicitação para guiar quem registra o chamado.
                </p>
                <input
                  type="text"
                  id="filtro-motivo"
                  required
                  maxLength={500}
                  value={filtro}
                  onChange={(e) => setFiltro(e.target.value)}
                  placeholder="Ex: Solicitações Acadêmicas > Provas > Correção de Nota"
                  className="w-full rounded-lg border border-borda bg-fundo px-3.5 py-2 text-xs font-medium text-texto focus:border-acento focus:outline-none"
                />
              </div>

              {/* Alerta de Motivos Similares */}
              {motivosSimilares.length > 0 && !motivoEditando && (
                <div className="rounded-lg border border-alerta/40 bg-alerta-fundo/40 p-3.5 space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-alerta">
                    <AlertCircle className="h-4 w-4" />
                    <span>Motivos parecidos já cadastrados:</span>
                  </div>
                  <ul className="divide-y divide-borda/40 text-xs">
                    {motivosSimilares.map((s) => (
                      <li key={s.id} className="py-1.5 flex items-center justify-between">
                        <span className="text-texto">
                          <strong className="font-mono text-texto-suave mr-1">{s.codigo}</strong>{" "}
                          {s.nome}
                        </span>
                        <span className="font-mono text-[10px] text-texto-suave tabular-nums">
                          {Math.round(s.similaridade * 100)}% similar
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="pt-1">
                    <CustomCheckbox
                      checked={confirmouCriacaoMesmoSimilar}
                      onChange={(chk) => setConfirmouCriacaoMesmoSimilar(chk)}
                      label="Confirmo que este novo motivo é diferente dos listados acima."
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-borda">
                <button
                  type="button"
                  onClick={() => setModalAberto(false)}
                  className="h-9 px-4 rounded-lg border border-borda bg-superficie text-xs font-semibold text-texto hover:bg-fundo"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="h-9 px-4 rounded-lg bg-acento text-xs font-semibold text-white hover:bg-acento-hover"
                >
                  Salvar Motivo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
