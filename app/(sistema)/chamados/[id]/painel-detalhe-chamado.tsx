"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  type Chamado,
  type Motivo,
  type Perfil,
  type ArquivoChamado,
  type LogAuditoria,
} from "@/types/database";
import {
  ArrowLeft,
  Edit2,
  Trash2,
  Paperclip,
  FileText,
  Download,
  Plus,
  Link as LinkIcon,
  History,
  AlertCircle,
  Clock,
  UserCheck,
} from "lucide-react";
import { anexarArquivoAction, excluirArquivoAction, excluirChamadoAction } from "../actions";
import { formatarCpf } from "@/lib/utils/cpf";
import { ROTULOS_SITUACAO } from "@/lib/chamados/situacao";

interface PainelDetalheChamadoProps {
  chamado: Chamado & {
    motivos?: Pick<Motivo, "id" | "codigo" | "nome"> | null;
    perfisCriador?: Pick<Perfil, "id" | "nome_completo" | "email"> | null;
    perfisAtualizador?: Pick<Perfil, "id" | "nome_completo" | "email"> | null;
  };
  arquivos: (ArquivoChamado & { perfis?: Pick<Perfil, "nome_completo"> | null })[];
  chamadoAnterior?: {
    id: string;
    protocolo: string;
    aluno_nome: string;
    situacao: string;
    data_solicitacao: string;
  } | null;
  chamadosPosteriores?:
    | {
        id: string;
        protocolo: string;
        aluno_nome: string;
        situacao: string;
        data_solicitacao: string;
      }[]
    | null;
  logs: LogAuditoria[];
  perfilAtual: Perfil;
}

export function PainelDetalheChamado({
  chamado,
  arquivos,
  chamadoAnterior,
  chamadosPosteriores,
  logs,
  perfilAtual,
}: PainelDetalheChamadoProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [modalAnexoAberto, setModalAnexoAberto] = useState(false);
  const [modalExcluirAberto, setModalExcluirAberto] = useState(false);
  const [descricaoAnexo, setDescricaoAnexo] = useState("");
  const [arquivosParaUpload, setArquivosParaUpload] = useState<File[]>([]);
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);

  const ehAdmin = perfilAtual.papel === "admin";
  const ehCriadorOriginal = chamado.criado_por === perfilAtual.id;
  const podeExcluir = ehAdmin || ehCriadorOriginal;

  const formatarTelefone = (tel?: string | null) => {
    if (!tel) return "Não informado";
    const d = tel.replace(/\D/g, "");
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return tel;
  };

  const handleUploadAnexos = async (e: React.FormEvent) => {
    e.preventDefault();
    if (arquivosParaUpload.length === 0) return;

    setMensagemErro(null);
    const formData = new FormData();
    formData.set("chamado_id", chamado.id);
    formData.set("descricao", descricaoAnexo);

    for (const arq of arquivosParaUpload) {
      formData.append("arquivos", arq);
    }

    startTransition(async () => {
      const res = await anexarArquivoAction(formData);
      if (res.erro) {
        setMensagemErro(res.erro);
      } else {
        setModalAnexoAberto(false);
        setArquivosParaUpload([]);
        setDescricaoAnexo("");
        router.refresh();
      }
    });
  };

  const handleExcluirArquivo = async (arquivoId: string) => {
    if (!confirm("Deseja realmente remover este arquivo anexo?")) return;
    startTransition(async () => {
      await excluirArquivoAction(arquivoId, chamado.id);
      router.refresh();
    });
  };

  const handleExcluirChamado = async () => {
    startTransition(async () => {
      const res = await excluirChamadoAction(chamado.id);
      if (res.sucesso) {
        router.push("/chamados");
      } else {
        setMensagemErro(res.erro || "Falha ao excluir chamado.");
      }
    });
  };

  const criadorNome = chamado.perfisCriador?.nome_completo || "Responsável";
  const atualizadorNome = chamado.perfisAtualizador?.nome_completo || criadorNome;
  const teveEdicao = chamado.atualizado_em && chamado.atualizado_em !== chamado.criado_em;

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      {/* Barra de Ações Superior */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          href="/chamados"
          className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-borda bg-superficie text-xs font-semibold text-texto transition hover:bg-fundo"
        >
          <ArrowLeft className="h-4 w-4" />
          <span>Voltar para chamados</span>
        </Link>

        <div className="flex flex-wrap items-center gap-2">
          {/* Edição colaborativa */}
          <Link
            href={`/chamados/${chamado.id}/editar`}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-acento text-xs font-semibold text-white transition hover:bg-acento-hover"
          >
            <Edit2 className="h-3.5 w-3.5" />
            <span>Editar chamado</span>
          </Link>

          {/* Somente autor ou admin pode excluir */}
          {podeExcluir && (
            <button
              type="button"
              onClick={() => setModalExcluirAberto(true)}
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg border border-erro/40 bg-erro-fundo text-xs font-semibold text-erro transition hover:bg-erro hover:text-white"
            >
              <Trash2 className="h-3.5 w-3.5" />
              <span>Excluir</span>
            </button>
          )}
        </div>
      </div>

      {mensagemErro && (
        <div className="flex items-start gap-2.5 rounded-lg border border-erro/40 bg-erro-fundo p-4 text-xs font-semibold text-erro shadow-sm">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{mensagemErro}</span>
        </div>
      )}

      {/* Cartão de Detalhes Principais */}
      <div className="rounded-xl border border-borda bg-superficie p-6 shadow-sm space-y-5">
        {/* Cabeçalho do Chamado com Badges e Carimbos */}
        <div className="flex flex-col gap-3 border-b border-borda pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2.5 flex-wrap">
              <h1 className="font-mono text-xl font-extrabold text-texto tabular-nums">
                {chamado.protocolo}
              </h1>
              <span
                className={`inline-block rounded-md border px-2.5 py-1 text-xs font-bold capitalize ${
                  chamado.situacao === "concluido"
                    ? "bg-sucesso/15 text-sucesso border-sucesso/40"
                    : chamado.situacao === "encerrado"
                      ? "bg-fundo text-texto-suave border-borda"
                      : "bg-acento/15 text-acento border-acento/40"
                }`}
              >
                {ROTULOS_SITUACAO[chamado.situacao]}
              </span>
              {chamado.prioridade === "priorizar" && (
                <span className="rounded-md border border-alerta/50 bg-alerta-fundo px-2.5 py-1 text-xs font-bold text-alerta">
                  Priorizar
                </span>
              )}
            </div>

            {/* Carimbo de Criação e Última Alteração Visível */}
            <div className="mt-2 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-4 text-xs text-texto-suave">
              <div className="flex items-center gap-1">
                <UserCheck className="h-3.5 w-3.5 text-acento" />
                <span>
                  Criado por <strong className="text-texto font-semibold">{criadorNome}</strong> em{" "}
                  {format(parseISO(chamado.criado_em), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </span>
              </div>

              {teveEdicao && (
                <div className="flex items-center gap-1 rounded bg-fundo px-2 py-0.5 border border-borda/60 text-[11px]">
                  <Clock className="h-3 w-3 text-texto-suave" />
                  <span>
                    Última alteração por{" "}
                    <strong className="text-texto font-semibold">{atualizadorNome}</strong> em{" "}
                    {format(parseISO(chamado.atualizado_em), "dd/MM/yyyy 'às' HH:mm", {
                      locale: ptBR,
                    })}
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Informações Estruturadas em Grid */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 text-xs">
          <div className="rounded-md border border-borda/60 bg-fundo p-3 sm:col-span-2">
            <span className="font-semibold text-texto-suave block text-[11px]">
              Aluno(a) Solicitante
            </span>
            <span className="text-texto font-bold text-sm block mt-0.5">{chamado.aluno_nome}</span>
          </div>

          <div className="rounded-md border border-borda/60 bg-fundo p-3">
            <span className="font-semibold text-texto-suave block text-[11px]">Polo de Origem</span>
            <span className="text-texto font-bold block mt-0.5">
              {chamado.polo_nome
                ? `${chamado.polo_nome} (${chamado.polo_cidade})`
                : "Não vinculado"}
            </span>
          </div>

          <div className="rounded-md border border-borda/60 bg-fundo p-3">
            <span className="font-semibold text-texto-suave block text-[11px]">CPF do Aluno</span>
            <span className="text-texto font-mono font-bold tabular-nums block mt-0.5">
              {chamado.aluno_cpf ? formatarCpf(chamado.aluno_cpf) : "Não informado"}
            </span>
          </div>

          <div className="rounded-md border border-borda/60 bg-fundo p-3">
            <span className="font-semibold text-texto-suave block text-[11px]">RA / Matrícula</span>
            <span className="text-texto font-mono font-bold tabular-nums block mt-0.5">
              {chamado.aluno_ra || "Não informado"}
            </span>
          </div>

          <div className="rounded-md border border-borda/60 bg-fundo p-3">
            <span className="font-semibold text-texto-suave block text-[11px]">
              Telefone de Contato
            </span>
            <span className="text-texto font-mono font-bold tabular-nums block mt-0.5">
              {formatarTelefone(chamado.contato_telefone)}
            </span>
          </div>

          <div className="rounded-md border border-borda/60 bg-fundo p-3 sm:col-span-2">
            <span className="font-semibold text-texto-suave block text-[11px]">
              Catálogo de Motivo
            </span>
            <span className="text-texto font-bold block mt-0.5">
              {chamado.motivos
                ? `${chamado.motivos.codigo} — ${chamado.motivos.nome}`
                : "Não categorizado"}
            </span>
          </div>

          <div className="rounded-md border border-borda/60 bg-fundo p-3">
            <span className="font-semibold text-texto-suave block text-[11px]">
              Prazos (Abertura / Limite)
            </span>
            <span className="text-texto font-mono font-bold tabular-nums block mt-0.5">
              {format(parseISO(chamado.data_solicitacao), "dd/MM/yyyy")} até{" "}
              {format(parseISO(chamado.prazo), "dd/MM/yyyy")}
            </span>
          </div>
        </div>

        {chamado.descricao && (
          <div className="border-t border-borda pt-3 text-xs space-y-1">
            <span className="font-bold text-texto block">Descrição do Chamado</span>
            <p className="text-texto whitespace-pre-wrap bg-fundo rounded-lg border border-borda p-3.5 leading-relaxed">
              {chamado.descricao}
            </p>
          </div>
        )}

        {chamado.observacao && (
          <div className="border-t border-borda pt-3 text-xs space-y-1">
            <span className="font-bold text-texto block">Observações Internas da Equipe</span>
            <p className="text-texto whitespace-pre-wrap bg-fundo rounded-lg border border-borda p-3.5 leading-relaxed">
              {chamado.observacao}
            </p>
          </div>
        )}
      </div>

      {/* Seção de Múltiplos Arquivos Anexos (1:N) */}
      <div className="rounded-xl border border-borda bg-superficie p-6 shadow-sm space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-borda pb-3">
          <div className="flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-acento" />
            <h2 className="font-heading text-sm font-bold text-texto">
              Arquivos e Comprovantes Anexados ({arquivos.length})
            </h2>
          </div>

          <button
            type="button"
            onClick={() => setModalAnexoAberto(true)}
            className="inline-flex items-center gap-1.5 rounded-md border border-borda bg-fundo px-3 py-1.5 text-xs font-bold text-texto transition hover:bg-superficie shadow-xs"
          >
            <Plus className="h-3.5 w-3.5 text-acento" />
            <span>Anexar novo arquivo</span>
          </button>
        </div>

        {arquivos.length === 0 ? (
          <div className="rounded-lg border border-dashed border-borda bg-fundo/40 p-6 text-center text-xs text-texto-suave">
            Nenhum documento ou comprovante anexado a este protocolo até o momento.
          </div>
        ) : (
          <div className="divide-y divide-borda/60 rounded-lg border border-borda bg-fundo overflow-hidden shadow-xs">
            {arquivos.map((arq) => {
              const podeRemoverArquivo = ehAdmin || arq.criado_por === perfilAtual.id;
              const uploaderNome = arq.perfis?.nome_completo || "Colaboradora";

              return (
                <div
                  key={arq.id}
                  className="flex flex-col gap-2 p-3.5 sm:flex-row sm:items-center sm:justify-between text-xs hover:bg-superficie/60 transition"
                >
                  <div className="flex items-start gap-3 truncate">
                    <div className="h-9 w-9 rounded-md bg-acento/10 text-acento flex items-center justify-center shrink-0 border border-acento/20">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="truncate">
                      <div className="font-bold text-texto truncate">{arq.nome_original}</div>
                      <div className="text-[11px] text-texto-suave">
                        Anexado por{" "}
                        <strong className="text-texto font-medium">{uploaderNome}</strong> em{" "}
                        {format(parseISO(arq.criado_em), "dd/MM/yyyy HH:mm")}
                        {arq.tamanho_bytes ? ` • ${Math.round(arq.tamanho_bytes / 1024)} KB` : ""}
                      </div>
                      {arq.descricao && (
                        <div className="text-[11px] text-texto font-medium mt-0.5 italic">
                          "{arq.descricao}"
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
                    <a
                      href={`/api/anexos/${arq.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-md border border-borda bg-superficie px-3 py-1.5 text-xs font-bold text-texto hover:bg-fundo transition shadow-xs"
                    >
                      <Download className="h-3.5 w-3.5" />
                      <span>Baixar</span>
                    </a>

                    {podeRemoverArquivo && (
                      <button
                        type="button"
                        onClick={() => handleExcluirArquivo(arq.id)}
                        disabled={isPending}
                        className="rounded-md border border-erro/30 bg-erro-fundo p-1.5 text-erro hover:bg-erro hover:text-white transition shadow-xs"
                        title="Excluir anexo"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Cadeia de Chamados Vinculados */}
      <div className="rounded-xl border border-borda bg-superficie p-6 shadow-sm space-y-3">
        <h2 className="font-heading text-sm font-bold text-texto border-b border-borda pb-2 flex items-center gap-2">
          <LinkIcon className="h-4 w-4 text-acento" />
          <span>Cadeia de Vínculos e Continuidade de Atendimento</span>
        </h2>

        {chamadoAnterior && (
          <div className="rounded-lg border border-borda bg-fundo p-3.5 text-xs shadow-xs">
            <span className="text-texto-suave block text-[11px] font-semibold mb-1">
              Protocolo Anterior Vinculado:
            </span>
            <div className="flex items-center justify-between">
              <div>
                <Link
                  href={`/chamados/${chamadoAnterior.id}`}
                  className="font-mono font-bold text-acento hover:underline mr-2"
                >
                  {chamadoAnterior.protocolo}
                </Link>
                <span className="text-texto font-medium">{chamadoAnterior.aluno_nome}</span>
                <span className="ml-2 text-texto-suave">({chamadoAnterior.situacao})</span>
              </div>
              <span className="font-mono text-texto-suave tabular-nums">
                {format(parseISO(chamadoAnterior.data_solicitacao), "dd/MM/yyyy", { locale: ptBR })}
              </span>
            </div>
          </div>
        )}

        {chamadosPosteriores && chamadosPosteriores.length > 0 && (
          <div className="space-y-2">
            <span className="text-texto-suave block text-[11px] font-semibold">
              Protocolos Posteriores Vinculados a este:
            </span>
            <div className="rounded-lg border border-borda bg-fundo divide-y divide-borda/60 shadow-xs">
              {chamadosPosteriores.map((post) => (
                <div key={post.id} className="flex items-center justify-between p-3 text-xs">
                  <div>
                    <Link
                      href={`/chamados/${post.id}`}
                      className="font-mono font-bold text-acento hover:underline mr-2"
                    >
                      {post.protocolo}
                    </Link>
                    <span className="text-texto font-medium">{post.aluno_nome}</span>
                    <span className="ml-2 text-texto-suave">({post.situacao})</span>
                  </div>
                  <span className="font-mono text-texto-suave tabular-nums">
                    {format(parseISO(post.data_solicitacao), "dd/MM/yyyy", { locale: ptBR })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!chamadoAnterior && (!chamadosPosteriores || chamadosPosteriores.length === 0) && (
          <p className="text-xs text-texto-suave">
            Nenhum chamado anterior ou posterior vinculado a este protocolo.
          </p>
        )}
      </div>

      {/* Linha do Tempo / Histórico de Auditoria */}
      <div className="rounded-xl border border-borda bg-superficie p-6 shadow-sm space-y-3">
        <h2 className="font-heading text-sm font-bold text-texto border-b border-borda pb-2 flex items-center gap-2">
          <History className="h-4 w-4 text-acento" />
          <span>Linha do Tempo e Histórico de Modificações do Chamado</span>
        </h2>

        {!logs || logs.length === 0 ? (
          <p className="text-xs text-texto-suave">Nenhum evento registrado no histórico.</p>
        ) : (
          <div className="space-y-2.5">
            {logs.map((log) => (
              <div
                key={log.id}
                className="rounded-lg border border-borda bg-fundo p-3.5 text-xs space-y-1.5 shadow-xs"
              >
                <div className="flex items-center justify-between border-b border-borda/40 pb-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono text-[11px] font-bold px-2 py-0.5 rounded border ${
                        log.operacao === "INSERT"
                          ? "bg-sucesso/15 text-sucesso border-sucesso/30"
                          : "bg-alerta-fundo text-alerta border-alerta/30"
                      }`}
                    >
                      {log.operacao === "INSERT" ? "Criação Inicial" : "Edição Registrada"}
                    </span>
                    <span className="text-texto-suave">por</span>
                    <span className="font-bold text-texto">
                      {log.usuario_nome || "Colaboradora"}
                    </span>
                  </div>
                  <span className="font-mono text-[11px] text-texto-suave tabular-nums">
                    {format(parseISO(log.criado_em), "dd/MM/yyyy HH:mm:ss", { locale: ptBR })}
                  </span>
                </div>

                {log.campos_alterados && log.campos_alterados.length > 0 && (
                  <div className="pt-1 text-[11px]">
                    <span className="text-texto-suave font-medium">
                      Campos alterados nesta ação:{" "}
                    </span>
                    <span className="font-mono text-texto font-semibold">
                      {log.campos_alterados.join(", ")}
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Anexar Arquivos */}
      {modalAnexoAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-borda bg-fundo p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-borda pb-3">
              <h3 className="font-heading text-sm font-bold text-texto flex items-center gap-2">
                <Paperclip className="h-4 w-4 text-acento" />
                <span>Anexar Arquivos ao Chamado {chamado.protocolo}</span>
              </h3>
              <button
                type="button"
                onClick={() => setModalAnexoAberto(false)}
                className="text-texto-suave hover:text-texto text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUploadAnexos} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-texto mb-1.5">
                  Selecionar Arquivos (múltiplos permitidos) *
                </label>
                <input
                  type="file"
                  required
                  multiple
                  onChange={(e) => {
                    if (e.target.files) {
                      setArquivosParaUpload(Array.from(e.target.files));
                    }
                  }}
                  className="w-full rounded-md border border-borda bg-superficie p-2.5 text-xs text-texto focus:border-acento focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-texto mb-1.5">
                  Descrição ou Observação do Anexo (opcional)
                </label>
                <input
                  type="text"
                  value={descricaoAnexo}
                  onChange={(e) => setDescricaoAnexo(e.target.value)}
                  placeholder="Ex: Comprovante de pagamento atualizado ou print da plataforma..."
                  className="w-full rounded-md border border-borda bg-superficie px-3 py-2 text-xs text-texto focus:border-acento focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-borda">
                <button
                  type="button"
                  onClick={() => setModalAnexoAberto(false)}
                  className="rounded-md border border-borda bg-superficie px-4 py-2 text-xs font-bold text-texto hover:bg-fundo"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isPending || arquivosParaUpload.length === 0}
                  className="rounded-md bg-acento px-5 py-2 text-xs font-bold text-white hover:bg-acento-hover disabled:opacity-50"
                >
                  {isPending ? "Enviando..." : "Salvar Anexos"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmação de Exclusão */}
      {modalExcluirAberto && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-xl border border-borda bg-fundo p-6 shadow-xl space-y-4">
            <h3 className="font-heading text-base font-bold text-erro flex items-center gap-2">
              <Trash2 className="h-5 w-5" />
              <span>Confirmar Exclusão de Chamado</span>
            </h3>
            <p className="text-xs text-texto leading-relaxed">
              Tem certeza de que deseja excluir o chamado <strong>{chamado.protocolo}</strong>? Esta
              ação será registrada no histórico de auditoria.
            </p>
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-borda">
              <button
                type="button"
                onClick={() => setModalExcluirAberto(false)}
                className="rounded-md border border-borda bg-superficie px-4 py-2 text-xs font-bold text-texto hover:bg-fundo"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleExcluirChamado}
                disabled={isPending}
                className="rounded-md bg-erro px-5 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {isPending ? "Excluindo..." : "Confirmar Exclusão"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
