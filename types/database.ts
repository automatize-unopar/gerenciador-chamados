export type PapelUsuario = "admin" | "coordenador" | "atendente";
export type SituacaoChamado = "aguardando" | "concluido" | "encerrado" | "rascunho" | "escalonado";
export type PrioridadeChamado = "normal" | "priorizar";

export interface Polo {
  id: string;
  nome: string;
  codigo: string;
  cidade: string;
  estado: string;
  ativo: boolean;
  criado_em: string;
}

export interface Usuario {
  id: string;
  nome_completo: string;
  email: string;
  papel: PapelUsuario;
  ativo: boolean;
  polo_id?: string | null;
  polo_nome?: string | null;
  polo_cidade?: string | null;
  avatar_url?: string | null;
  criado_em: string;
  atualizado_em: string;
}

// Alias para compatibilidade
export type Perfil = Usuario;

export interface CredencialExterna {
  perfil_id: string;
  senha_cifrada: Buffer | string;
  iv: Buffer | string;
  auth_tag: Buffer | string;
  atualizado_em: string;
  atualizado_por?: string | null;
}

export interface CredencialAcesso {
  id: number;
  perfil_alvo: string;
  admin_id: string;
  data_hora: string;
  ip?: string | null;
  user_agent?: string | null;
}

export interface Motivo {
  id: string;
  numero: number;
  codigo: string;
  nome: string;
  nome_normalizado: string;
  filtro?: string | null;
  ativo: boolean;
  criado_por?: string | null;
  criado_em: string;
  total_chamados?: number;
}

export interface ArquivoChamado {
  id: string;
  chamado_id: string;
  nome_original: string;
  caminho_storage: string;
  tamanho_bytes?: number | null;
  tipo_mime?: string | null;
  descricao?: string | null;
  criado_por: string;
  criado_por_nome?: string | null;
  criado_em: string;
}

export interface Chamado {
  id: string;
  protocolo: string;
  aluno_nome: string;
  aluno_ra?: string | null;
  aluno_cpf?: string | null;
  contato_telefone?: string | null;
  motivo_id: string;
  descricao?: string | null;
  situacao: SituacaoChamado;
  prioridade: PrioridadeChamado;
  data_solicitacao: string;
  prazo: string;
  data_conclusao?: string | null;
  chamado_vinculado_id?: string | null;
  observacao?: string | null;
  importado: boolean;
  polo_id?: string | null;
  polo_nome?: string | null;
  polo_cidade?: string | null;
  polo_codigo?: string | null;
  criado_por: string;
  criado_por_nome?: string | null;
  atualizado_por?: string | null;
  atualizado_por_nome?: string | null;
  criado_em: string;
  atualizado_em: string;
  excluido_em?: string | null;
  excluido_por?: string | null;
  arquivos?: ArquivoChamado[];
}

export interface LogAuditoria {
  id: number;
  tabela: string;
  registro_id?: string | null;
  operacao: "INSERT" | "UPDATE" | "DELETE";
  dados_antes?: Record<string, unknown> | null;
  dados_depois?: Record<string, unknown> | null;
  campos_alterados?: string[] | null;
  usuario_id?: string | null;
  usuario_nome?: string | null;
  protocolo?: string | null;
  ip?: string | null;
  criado_em: string;
}

export interface RankingItem {
  posicao: number;
  usuario_id: string;
  nome_completo: string;
  email: string;
  papel: PapelUsuario;
  volume_total: number;
  resolvidos: number;
  encerrados: number;
  aguardando: number;
  volume_ponderado: number;
  no_prazo: number;
  taxa_prazo: number;
  tempo_medio_dias: number;
  pontos_volume: number;
  pontos_prazo: number;
  pontos_agilidade: number;
  pontos_total: number;
}
