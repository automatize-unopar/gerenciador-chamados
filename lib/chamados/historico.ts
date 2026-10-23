/** Normaliza o histórico do SQL Server antes de enviá-lo à interface. */
export function lerObjetoAuditoria(valor: unknown): Record<string, unknown> | null {
  if (typeof valor === "string") {
    try {
      return lerObjetoAuditoria(JSON.parse(valor));
    } catch {
      return null;
    }
  }
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? (valor as Record<string, unknown>)
    : null;
}

export function lerCamposAlterados(valor: unknown): string[] {
  if (Array.isArray(valor)) return valor.filter((item): item is string => typeof item === "string");
  if (typeof valor !== "string" || !valor.trim()) return [];
  try {
    return lerCamposAlterados(JSON.parse(valor));
  } catch {
    return valor
      .split(",")
      .map((campo) => campo.trim())
      .filter(Boolean);
  }
}

export function dataIsoOuNull(valor: unknown): string | null {
  if (!(valor instanceof Date) && typeof valor !== "string" && typeof valor !== "number")
    return null;
  if (valor === "") return null;
  const data = new Date(valor);
  return Number.isNaN(data.getTime()) ? null : data.toISOString();
}
