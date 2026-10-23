"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { type Chamado, type Motivo, type Polo } from "@/types/database";
import { salvarChamado, verificarProtocoloDuplicado, buscarChamadosParaVinculo } from "./actions";
import {
  AlertCircle,
  Link as LinkIcon,
  ArrowLeft,
  Paperclip,
  FileText,
  X,
  UploadCloud,
  Search,
} from "lucide-react";
import Link from "next/link";
import { CustomSelect, type CustomSelectOption } from "@/components/ui/custom-select";
import { CustomDatePicker } from "@/components/ui/custom-date-picker";
import { formatarCpf } from "@/lib/utils/cpf";

interface FormularioChamadoProps {
  chamadoInicial?: Chamado | null;
  motivos: Motivo[];
  polos?: Polo[];
  poloUsuario?: string | null;
  chamadoVinculadoInicial?: {
    id: string;
    protocolo: string;
    aluno_nome: string;
  } | null;
}

export function FormularioChamado({
  chamadoInicial,
  motivos,
  polos = [],
  poloUsuario,
  chamadoVinculadoInicial,
}: FormularioChamadoProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [protocolo, setProtocolo] = useState(chamadoInicial?.protocolo || "");
  const [alunoNome, setAlunoNome] = useState(chamadoInicial?.aluno_nome || "");
  const [alunoRa, setAlunoRa] = useState(chamadoInicial?.aluno_ra || "");
  const [alunoCpf, setAlunoCpf] = useState(
    chamadoInicial?.aluno_cpf ? formatarCpf(chamadoInicial.aluno_cpf) : ""
  );
  const [poloId, setPoloId] = useState(
    chamadoInicial?.polo_id || poloUsuario || polos[0]?.id || ""
  );
  const [contatoTelefone, setContatoTelefone] = useState(chamadoInicial?.contato_telefone || "");
  const [motivoId, setMotivoId] = useState(chamadoInicial?.motivo_id || motivos[0]?.id || "");
  const [descricao, setDescricao] = useState(chamadoInicial?.descricao || "");
  const [situacao, setSituacao] = useState(chamadoInicial?.situacao || "aguardando");
  const [prioridade, setPrioridade] = useState(chamadoInicial?.prioridade || "normal");
  const [dataSolicitacao, setDataSolicitacao] = useState(
    chamadoInicial?.data_solicitacao || new Date().toISOString().split("T")[0]
  );
  const [prazo, setPrazo] = useState(
    chamadoInicial?.prazo ||
      new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
  );
  const [observacao, setObservacao] = useState(chamadoInicial?.observacao || "");

  // Múltiplos arquivos
  const [arquivosSelecionados, setArquivosSelecionados] = useState<File[]>([]);

  // Estado de verificação de protocolo duplicado
  const [avisoDuplicado, setAvisoDuplicado] = useState<string | null>(null);

  // Estado de vínculo com chamado anterior
  const [chamadoVinculado, setChamadoVinculado] = useState(chamadoVinculadoInicial || null);
  const [buscaVinculo, setBuscaVinculo] = useState("");
  const [resultadosVinculo, setResultadosVinculo] = useState<
    {
      id: string;
      protocolo: string;
      aluno_nome: string;
      data_solicitacao: string;
      situacao: string;
    }[]
  >([]);
  const [buscandoVinculo, setBuscandoVinculo] = useState(false);

  // Mensagens de retorno do formulário
  const [mensagemErro, setMensagemErro] = useState<string | null>(null);
  const [errosCampo, setErrosCampo] = useState<Record<string, string>>({});

  const opcoesMotivo: CustomSelectOption[] = motivos.map((m) => ({
    value: m.id,
    label: `${m.codigo} — ${m.nome}`,
    sublabel: m.filtro ? `Caminho: ${m.filtro}` : undefined,
  }));

  const opcoesPolo: CustomSelectOption[] = polos.map((p) => ({
    value: p.id,
    label: `${p.nome} — ${p.cidade} (${p.estado})`,
  }));

  const opcoesSituacao: CustomSelectOption[] = [
    { value: "aguardando", label: "Aguardando (em andamento)" },
    { value: "concluido", label: "Concluído (resolvido)" },
    { value: "encerrado", label: "Encerrado (sem resolver)" },
    { value: "rascunho", label: "Rascunho" },
    { value: "escalonado", label: "Escalonado" },
  ];

  const opcoesPrioridade: CustomSelectOption[] = [
    { value: "normal", label: "Normal" },
    { value: "priorizar", label: "Priorizar" },
  ];

  const handleVerificarProtocolo = async (valor: string) => {
    const limpo = valor.trim().toUpperCase();
    setProtocolo(limpo);
    setAvisoDuplicado(null);

    if (limpo.length >= 6) {
      const duplicado = await verificarProtocoloDuplicado(limpo, chamadoInicial?.id);
      if (duplicado) {
        setAvisoDuplicado(
          `Atenção: este protocolo já foi cadastrado por ${duplicado.criado_por_nome} em ${new Date(
            duplicado.criado_em
          ).toLocaleDateString("pt-BR")}.`
        );
      }
    }
  };

  const handleBuscarVinculo = async () => {
    if (!buscaVinculo || buscaVinculo.length < 2) return;
    setBuscandoVinculo(true);
    const res = await buscarChamadosParaVinculo(buscaVinculo);
    setResultadosVinculo(res.filter((c) => c.id !== chamadoInicial?.id));
    setBuscandoVinculo(false);
  };

  const handleAdicionarArquivos = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const novos = Array.from(e.target.files);
      setArquivosSelecionados((prev) => [...prev, ...novos]);
    }
  };

  const handleRemoverArquivo = (index: number) => {
    setArquivosSelecionados((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMensagemErro(null);
    setErrosCampo({});

    if (!descricao.trim()) {
      setErrosCampo({ descricao: "A descrição do chamado é obrigatória." });
      setMensagemErro("A descrição do chamado é obrigatória. Preencha os detalhes da solicitação.");
      return;
    }

    const formData = new FormData();
    if (chamadoInicial?.id) {
      formData.set("id", chamadoInicial.id);
    }
    formData.set("protocolo", protocolo);
    formData.set("aluno_nome", alunoNome);
    formData.set("aluno_ra", alunoRa || "");
    formData.set("aluno_cpf", alunoCpf || "");
    formData.set("polo_id", poloId || "");
    formData.set("contato_telefone", contatoTelefone || "");
    formData.set("motivo_id", motivoId);
    formData.set("descricao", descricao || "");
    formData.set("situacao", situacao || "aguardando");
    formData.set("prioridade", prioridade || "normal");
    formData.set("data_solicitacao", dataSolicitacao || "");
    formData.set("prazo", prazo || "");
    formData.set("observacao", observacao || "");

    if (chamadoVinculado?.id) {
      formData.set("chamado_vinculado_id", chamadoVinculado.id);
    }

    // Anexar múltiplos arquivos
    for (const arq of arquivosSelecionados) {
      formData.append("arquivos", arq);
    }

    startTransition(async () => {
      const resultado = await salvarChamado({}, formData);

      if (resultado.errosCampo && Object.keys(resultado.errosCampo).length > 0) {
        setErrosCampo(resultado.errosCampo);
        setMensagemErro(
          resultado.erro || "Corrija os erros apontados nos campos destacados abaixo."
        );
      } else if (resultado.erro) {
        setMensagemErro(resultado.erro);
      } else if (resultado.sucesso) {
        router.push("/chamados");
        router.refresh();
      }
    });
  };

  const calcularSla5DiasUteis = () => {
    if (!dataSolicitacao) return;
    const data = new Date(dataSolicitacao + "T12:00:00");
    let diasUteis = 0;
    while (diasUteis < 5) {
      data.setDate(data.getDate() + 1);
      const dia = data.getDay();
      if (dia !== 0 && dia !== 6) {
        diasUteis++;
      }
    }
    setPrazo(data.toISOString().split("T")[0]);
  };

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-4xl space-y-8 pb-12">
      {/* Topo do Formulário */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Link
            href="/chamados"
            className="btn-tátil h-9 w-9 rounded-lg border border-borda bg-superficie flex items-center justify-center text-texto-suave hover:bg-fundo hover:text-texto transition shadow-xs"
            title="Voltar para a listagem"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-texto">
              {chamadoInicial
                ? `Editar Chamado: ${chamadoInicial.protocolo}`
                : "Abertura de Novo Chamado"}
            </h1>
            <p className="text-sm text-texto-suave mt-0.5">
              {chamadoInicial
                ? "Atualize os dados e complemente o protocolo com novos arquivos."
                : "Cadastre as informações da solicitação aberta na plataforma externa."}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/chamados"
            className="btn-tátil h-9 px-4 rounded-lg border border-borda bg-superficie text-xs font-semibold text-texto hover:bg-fundo transition inline-flex items-center shadow-xs"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={isPending}
            className="btn-tátil h-9 px-5 rounded-lg bg-acento text-xs font-semibold text-white hover:bg-acento-hover disabled:opacity-50 transition inline-flex items-center shadow-xs"
          >
            {isPending ? "Salvando..." : chamadoInicial ? "Salvar Alterações" : "Salvar Chamado"}
          </button>
        </div>
      </div>

      {mensagemErro && (
        <div className="flex items-start gap-2.5 rounded-lg border border-erro/40 bg-erro-fundo p-4 text-xs font-medium text-erro">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{mensagemErro}</span>
        </div>
      )}

      {/* Seção 1: Identificação do Chamado */}
      <div className="rounded-xl border border-borda bg-superficie p-6 space-y-4 shadow-xs">
        <h2 className="font-heading text-sm font-bold text-texto border-b border-borda pb-3">
          Identificação do Protocolo e Aluno
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* Protocolo */}
          <div>
            <label className="block text-xs font-bold text-texto mb-1.5">
              Número do Protocolo (PAD){" "}
              <span className="text-texto-suave font-normal text-[11px]">
                (opcional — gerado automaticamente se vazio)
              </span>
            </label>
            <input
              type="text"
              value={protocolo}
              onChange={(e) => handleVerificarProtocolo(e.target.value)}
              placeholder="Ex: C345235256 ou deixe vazio para gerar"
              maxLength={20}
              className={`w-full rounded-lg border bg-fundo px-3.5 py-2 font-mono text-xs font-bold uppercase text-texto placeholder:normal-case placeholder:font-normal placeholder:text-texto-suave focus:outline-none shadow-xs ${
                errosCampo.protocolo
                  ? "border-erro ring-1 ring-erro/50 bg-erro-fundo/10"
                  : "border-borda focus:border-acento focus:ring-2 focus:ring-acento/20"
              }`}
            />
            {errosCampo.protocolo && (
              <p className="mt-1.5 text-[11px] font-semibold text-erro">{errosCampo.protocolo}</p>
            )}
            {avisoDuplicado && (
              <div className="mt-2 flex items-center gap-1.5 rounded-md border border-alerta/50 bg-alerta-fundo p-2 text-xs font-bold text-alerta shadow-xs">
                <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                <span>{avisoDuplicado}</span>
              </div>
            )}
          </div>

          {/* Motivo CustomSelect */}
          <div>
            <CustomSelect
              label="Motivo do Chamado *"
              options={opcoesMotivo}
              value={motivoId}
              onChange={(val) => setMotivoId(val)}
            />
            {errosCampo.motivo_id && (
              <p className="mt-1.5 text-[11px] font-semibold text-erro">{errosCampo.motivo_id}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="sm:col-span-2">
            <label className="block text-xs font-bold text-texto mb-1.5">
              Nome Completo do Aluno *
            </label>
            <input
              type="text"
              required
              value={alunoNome}
              onChange={(e) => setAlunoNome(e.target.value)}
              placeholder="Nome do aluno"
              maxLength={200}
              className={`w-full rounded-lg border bg-fundo px-3.5 py-2 text-xs font-medium text-texto placeholder:text-texto-suave focus:outline-none shadow-xs ${
                errosCampo.aluno_nome
                  ? "border-erro ring-1 ring-erro/50 bg-erro-fundo/10"
                  : "border-borda focus:border-acento focus:ring-2 focus:ring-acento/20"
              }`}
            />
            {errosCampo.aluno_nome && (
              <p className="mt-1.5 text-[11px] font-semibold text-erro">{errosCampo.aluno_nome}</p>
            )}
          </div>

          <div>
            <CustomSelect
              label="Polo de Origem *"
              options={opcoesPolo}
              value={poloId}
              onChange={(val) => setPoloId(val)}
            />
            {errosCampo.polo_id && (
              <p className="mt-1.5 text-[11px] font-semibold text-erro">{errosCampo.polo_id}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <label className="block text-xs font-bold text-texto mb-1.5">CPF do Aluno</label>
            <input
              type="text"
              value={alunoCpf}
              onChange={(e) => setAlunoCpf(formatarCpf(e.target.value))}
              placeholder="000.000.000-00 (opcional)"
              maxLength={14}
              className={`w-full rounded-lg border bg-fundo px-3.5 py-2 font-mono text-xs text-texto tabular-nums placeholder:text-texto-suave focus:outline-none shadow-xs ${
                errosCampo.aluno_cpf
                  ? "border-erro ring-1 ring-erro/50 bg-erro-fundo/10"
                  : "border-borda focus:border-acento focus:ring-2 focus:ring-acento/20"
              }`}
            />
            {errosCampo.aluno_cpf && (
              <p className="mt-1.5 text-[11px] font-semibold text-erro">{errosCampo.aluno_cpf}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold text-texto mb-1.5">
              RA / Matrícula (opcional)
            </label>
            <input
              type="text"
              value={alunoRa}
              onChange={(e) => setAlunoRa(e.target.value)}
              placeholder="Ex: 1234567"
              maxLength={50}
              className="w-full rounded-lg border border-borda bg-fundo px-3.5 py-2 font-mono text-xs text-texto tabular-nums placeholder:text-texto-suave focus:border-acento focus:outline-none shadow-xs"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-texto mb-1.5">
              Telefone de Contato (com DDD)
            </label>
            <input
              type="text"
              value={contatoTelefone}
              onChange={(e) => setContatoTelefone(e.target.value)}
              placeholder="(94) 99999-9999"
              maxLength={20}
              className="w-full rounded-lg border border-borda bg-fundo px-3.5 py-2 font-mono text-xs text-texto tabular-nums placeholder:text-texto-suave focus:border-acento focus:outline-none shadow-xs"
            />
          </div>
        </div>
      </div>

      {/* Seção 2: Prazos e Situação */}
      <div className="rounded-xl border border-borda bg-superficie p-6 space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-borda pb-3">
          <h2 className="font-heading text-sm font-bold text-texto">
            Controle de Prazo e Situação
          </h2>
          <button
            type="button"
            onClick={calcularSla5DiasUteis}
            className="btn-tátil text-[11px] font-semibold text-acento hover:underline flex items-center gap-1"
            title="Preencher com 5 dias úteis a partir da abertura"
          >
            <span>Auto: 5 dias úteis (SLA)</span>
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
          <div>
            <CustomDatePicker
              label="Data de Abertura"
              required
              value={dataSolicitacao}
              onChange={(val) => setDataSolicitacao(val)}
            />
          </div>

          <div>
            <CustomDatePicker
              label="Prazo Limite"
              required
              value={prazo}
              onChange={(val) => setPrazo(val)}
            />
          </div>

          <div>
            <CustomSelect
              label="Situação Atual *"
              options={opcoesSituacao}
              value={situacao}
              onChange={(val) =>
                setSituacao(
                  val as "aguardando" | "concluido" | "encerrado" | "rascunho" | "escalonado"
                )
              }
            />
          </div>

          <div>
            <CustomSelect
              label="Prioridade *"
              options={opcoesPrioridade}
              value={prioridade}
              onChange={(val) => setPrioridade(val as "normal" | "priorizar")}
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-texto mb-1.5">
            Descrição do Chamado <span className="text-erro font-bold">*</span>
          </label>
          <textarea
            rows={3}
            required
            value={descricao}
            onChange={(e) => {
              setDescricao(e.target.value);
              if (errosCampo.descricao) {
                setErrosCampo((prev) => {
                  const novo = { ...prev };
                  delete novo.descricao;
                  return novo;
                });
              }
            }}
            placeholder="Detalhes ou contexto da solicitação aberta na plataforma externa..."
            className={`w-full rounded-lg border bg-fundo px-3.5 py-2 text-xs font-medium text-texto placeholder:text-texto-suave focus:border-acento focus:outline-none shadow-xs ${
              errosCampo.descricao ? "border-erro ring-1 ring-erro" : "border-borda"
            }`}
          />
          {errosCampo.descricao && (
            <p className="mt-1 text-[11px] font-medium text-erro">{errosCampo.descricao}</p>
          )}
        </div>
      </div>

      {/* Seção 3: Anexo de Múltiplos Arquivos */}
      <div className="rounded-xl border border-borda bg-superficie p-6 space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-borda pb-3">
          <div className="flex items-center gap-2">
            <Paperclip className="h-4 w-4 text-acento" />
            <h2 className="font-heading text-sm font-bold text-texto">
              Arquivos e Documentos Anexos (1 ou mais)
            </h2>
          </div>
          <span className="text-[11px] font-semibold text-texto-suave">
            PDF, PNG, JPG (máx. 10MB por arquivo)
          </span>
        </div>

        {/* Dropzone Estilizado */}
        <label className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-borda bg-fundo/70 p-6 text-center hover:border-acento cursor-pointer transition shadow-inner">
          <UploadCloud className="h-8 w-8 text-texto-suave mb-2" />
          <span className="text-xs font-bold text-texto">
            Clique para selecionar um ou mais arquivos do computador
          </span>
          <span className="text-[11px] text-texto-suave mt-0.5">
            Você pode anexar comprovantes, protocolos escaneados e declarações.
          </span>
          <input
            type="file"
            multiple
            accept=".pdf,.png,.jpg,.jpeg,.doc,.docx"
            onChange={handleAdicionarArquivos}
            className="hidden"
          />
        </label>

        {/* Lista de Arquivos Selecionados */}
        {arquivosSelecionados.length > 0 && (
          <div className="space-y-2 pt-2">
            <span className="text-xs font-bold text-texto block">
              Arquivos prontos para envio ({arquivosSelecionados.length}):
            </span>
            <div className="divide-y divide-borda/60 rounded-lg border border-borda bg-fundo">
              {arquivosSelecionados.map((arq, idx) => (
                <div key={idx} className="flex items-center justify-between p-2.5 text-xs">
                  <div className="flex items-center gap-2 truncate">
                    <FileText className="h-4 w-4 text-acento shrink-0" />
                    <span className="font-semibold text-texto truncate">{arq.name}</span>
                    <span className="text-[11px] font-mono text-texto-suave">
                      ({(arq.size / 1024).toFixed(0)} KB)
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoverArquivo(idx)}
                    className="text-texto-suave hover:text-erro rounded-md p-1 transition"
                    title="Remover arquivo da lista"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Seção 4: Vínculo com Chamado Anterior (Reincidência) */}
      <div className="rounded-xl border border-borda bg-superficie p-6 space-y-4 shadow-sm">
        <div className="flex items-center gap-2 border-b border-borda pb-3">
          <LinkIcon className="h-4 w-4 text-acento" />
          <h2 className="font-heading text-sm font-bold text-texto">
            Vínculo com Protocolo Anterior (Reincidência)
          </h2>
        </div>

        {chamadoVinculado ? (
          <div className="flex items-center justify-between rounded-lg border border-acento/40 bg-acento/10 p-3.5 text-xs shadow-xs">
            <div className="flex items-center gap-2 font-medium text-texto">
              <span>Vinculado ao protocolo anterior:</span>
              <strong className="font-mono text-acento font-bold">
                {chamadoVinculado.protocolo}
              </strong>
              <span className="text-texto-suave">({chamadoVinculado.aluno_nome})</span>
            </div>
            <button
              type="button"
              onClick={() => setChamadoVinculado(null)}
              className="font-bold text-xs text-erro hover:underline"
            >
              Remover vínculo
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-texto-suave">
              Se este chamado for a reabertura ou continuação de um problema já tratado, busque o
              protocolo anterior para vinculá-los.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={buscaVinculo}
                  onChange={(e) => setBuscaVinculo(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleBuscarVinculo();
                    }
                  }}
                  placeholder="Buscar por protocolo (Ex: CS12345678) ou nome do aluno..."
                  className="w-full rounded-lg border border-borda bg-fundo pl-9 pr-3 py-2 text-xs font-medium text-texto placeholder:text-texto-suave focus:border-acento focus:outline-none shadow-xs"
                />
                <Search className="absolute left-3 top-2.5 h-4 w-4 text-texto-suave" />
              </div>
              <button
                type="button"
                onClick={handleBuscarVinculo}
                disabled={buscandoVinculo}
                className="rounded-lg border border-borda bg-fundo px-4 py-2 text-xs font-bold text-texto hover:bg-superficie shadow-xs transition"
              >
                {buscandoVinculo ? "Buscando..." : "Buscar"}
              </button>
            </div>

            {/* Resultados de Busca de Vínculo */}
            {resultadosVinculo.length > 0 && (
              <div className="divide-y divide-borda/60 rounded-lg border border-borda bg-fundo max-h-48 overflow-y-auto">
                {resultadosVinculo.map((r) => (
                  <div
                    key={r.id}
                    className="flex items-center justify-between p-3 text-xs hover:bg-superficie transition"
                  >
                    <div>
                      <span className="font-mono font-bold text-acento mr-2">{r.protocolo}</span>
                      <span className="font-semibold text-texto mr-2">{r.aluno_nome}</span>
                      <span className="text-[11px] text-texto-suave font-mono">
                        ({r.data_solicitacao})
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setChamadoVinculado(r);
                        setResultadosVinculo([]);
                        setBuscaVinculo("");
                      }}
                      className="rounded-md bg-acento px-3 py-1 text-xs font-bold text-white hover:bg-acento-hover shadow-xs transition"
                    >
                      Vincular
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Seção 5: Observações Internas */}
      <div className="rounded-xl border border-borda bg-superficie p-6 space-y-3 shadow-sm">
        <h2 className="font-heading text-sm font-bold text-texto border-b border-borda pb-3">
          Observações Internas (Opcional)
        </h2>
        <textarea
          rows={3}
          value={observacao}
          onChange={(e) => setObservacao(e.target.value)}
          placeholder="Notas internas da equipe da UNOPAR, instruções ou tratativas do atendimento..."
          className="w-full rounded-lg border border-borda bg-fundo px-3.5 py-2 text-xs font-medium text-texto placeholder:text-texto-suave focus:border-acento focus:outline-none shadow-xs"
        />
      </div>

      {/* Botões do Rodapé */}
      <div className="flex items-center justify-end gap-3 border-t border-borda pt-4">
        <Link
          href="/chamados"
          className="rounded-lg border border-borda bg-superficie px-4 py-2.5 text-xs font-bold text-texto hover:bg-fundo shadow-xs transition"
        >
          Cancelar
        </Link>
        <button
          type="submit"
          disabled={isPending}
          className="rounded-lg bg-acento px-6 py-2.5 text-xs font-bold text-white hover:bg-acento-hover disabled:opacity-50 shadow-md transition"
        >
          {isPending
            ? "Salvando..."
            : chamadoInicial
              ? "Salvar Alterações"
              : "Concluir Abertura do Chamado"}
        </button>
      </div>
    </form>
  );
}
