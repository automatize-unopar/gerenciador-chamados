import type { SituacaoChamado } from "@/types/database";

export const SITUACOES_CHAMADO = [
  "aguardando",
  "concluido",
  "encerrado",
  "rascunho",
  "escalonado",
] as const;

export function chamadoEstaAberto(situacao: string): boolean {
  return situacao === "aguardando" || situacao === "escalonado";
}

export const ROTULOS_SITUACAO: Record<SituacaoChamado, string> = {
  aguardando: "Aguardando",
  concluido: "Concluído",
  encerrado: "Encerrado",
  rascunho: "Rascunho",
  escalonado: "Escalonado",
};
