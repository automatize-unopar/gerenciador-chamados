import { loadEnvConfig } from "@next/env";
import { readFile } from "node:fs/promises";
import { getPool, sql } from "../lib/db/pool";

async function executar() {
  loadEnvConfig(process.cwd());
  if (!process.env.MSSQL_HOST || !process.env.MSSQL_PASSWORD) {
    throw new Error("Conexão MSSQL não configurada neste ambiente. Nenhuma alteração executada.");
  }
  const pool = await getPool();
  try {
    const pagina = await readFile("app/(sistema)/chamados/[id]/page.tsx", "utf8");
    const consulta = pagina.match(/\.query\(`([\s\S]*?)`\)/)?.[1];
    if (!consulta) throw new Error("Consulta de detalhes não localizada.");
    await pool
      .request()
      .input("id", sql.VarChar(50), "00000000-0000-0000-0000-000000000000")
      .query(consulta.replace(/SELECT\s/, "SELECT TOP (0) "));
    console.log(
      "Consulta corrigida dos detalhes validada no SQL Server (sem leitura de registros)."
    );
    const permissoes = await pool.request().query(`
      SELECT HAS_PERMS_BY_NAME(N'dados.chamados', N'OBJECT', N'ALTER') AS pode_alterar
    `);
    console.log(
      "Permissão para atualizar a restrição:",
      permissoes.recordset[0]?.pode_alterar === 1
    );
    const atual = await pool.request().query(`
      SELECT name, definition, is_disabled, is_not_trusted
      FROM sys.check_constraints
      WHERE parent_object_id = OBJECT_ID(N'dados.chamados')
        AND definition LIKE '%situacao%'
    `);
    console.log("Restrições atuais de situação:", atual.recordset);
    if (!process.argv.includes("--aplicar")) return;
    const inesperada = atual.recordset.some(
      (r: { name: string }) => r.name !== "ck_chamados_situacao"
    );
    if (inesperada)
      throw new Error("Há outra restrição de situação; revise o schema antes de alterar.");
    const script = await readFile("scripts/ajuste_constraint_situacao_escalonado.sql", "utf8");
    const resultado = await pool.request().query(script);
    console.log("Restrição atualizada e validada:", resultado.recordset);
  } finally {
    await pool.close();
  }
}

executar().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : "Falha ao atualizar as situações.");
  process.exitCode = 1;
});
