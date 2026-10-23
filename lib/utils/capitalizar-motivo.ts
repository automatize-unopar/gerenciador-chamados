/** Primeira letra de cada palavra em maiúscula, preservando acentos e números. */
export function capitalizarMotivo(nome: string): string {
  return nome
    .normalize("NFC")
    .trim()
    .replace(/\s+/gu, " ")
    .toLocaleLowerCase("pt-BR")
    .replace(
      /(^|[^\p{L}\p{M}\p{N}])(\p{L})/gu,
      (_trecho, separador: string, letra: string) => separador + letra.toLocaleUpperCase("pt-BR")
    );
}
