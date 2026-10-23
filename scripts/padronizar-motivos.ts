import { loadEnvConfig } from "@next/env";
import { getPool, sql } from "../lib/db/pool";
import { capitalizarMotivo } from "../lib/utils/capitalizar-motivo";

async function executar() {
  loadEnvConfig(process.cwd());
  if (!process.env.MSSQL_HOST || !process.env.MSSQL_PASSWORD) {
    throw new Error("Conexão MSSQL não configurada. Nenhuma alteração executada.");
  }
  const aplicar = process.argv.includes("--aplicar");
  const pool = await getPool();
  const transacao = new sql.Transaction(pool);
  let emTransacao = false;
  try {
    await transacao.begin();
    emTransacao = true;
    // Sem impersonar colaboradoras: a auditoria utiliza o contexto da conexão de manutenção.
    const request = new sql.Request(transacao);
    const registros = await request.query(`
      SELECT CAST(id AS NVARCHAR(50)) AS id, nome
      FROM dados.motivos WITH (UPDLOCK, HOLDLOCK)
    `);
    const alteracoes = registros.recordset
      .map((motivo: { id: string; nome: string }) => ({
        id: motivo.id,
        antes: motivo.nome,
        depois: capitalizarMotivo(motivo.nome),
      }))
      .filter((motivo: { antes: string; depois: string }) => motivo.antes !== motivo.depois);
    console.log(
      `Motivos encontrados: ${registros.recordset.length}. A padronizar: ${alteracoes.length}.`
    );
    if (!aplicar) {
      await transacao.rollback();
      emTransacao = false;
      console.log("Somente conferência. Use --aplicar para persistir a padronização.");
      return;
    }
    for (const motivo of alteracoes) {
      const resultado = await new sql.Request(transacao)
        .input("id", sql.VarChar(50), motivo.id)
        .input("nome", sql.NVarChar(255), motivo.depois)
        .query(`UPDATE dados.motivos SET nome = @nome WHERE id = @id;
                SELECT nome FROM dados.motivos WHERE id = @id;`);
      if (resultado.recordset[0]?.nome !== motivo.depois) {
        throw new Error("A verificação da gravação falhou; todas as alterações serão desfeitas.");
      }
    }
    const final = await new sql.Request(transacao).query(`
      SELECT CAST(id AS NVARCHAR(50)) AS id, nome FROM dados.motivos
    `);
    const idsOriginais = new Set(registros.recordset.map((m: { id: string }) => m.id));
    if (
      final.recordset.length !== registros.recordset.length ||
      final.recordset.some(
        (m: { id: string; nome: string }) =>
          !idsOriginais.has(m.id) || m.nome !== capitalizarMotivo(m.nome)
      )
    ) {
      throw new Error("A verificação final falhou; a transação será desfeita.");
    }
    await transacao.commit();
    emTransacao = false;
    console.log(
      `Padronização concluída: ${alteracoes.length} motivos atualizados; IDs e vínculos preservados.`
    );
  } catch (erro) {
    if (emTransacao) await transacao.rollback();
    throw erro;
  } finally {
    await pool.close();
  }
}

executar().catch((erro: unknown) => {
  console.error(erro instanceof Error ? erro.message : "Falha na padronização dos motivos.");
  process.exitCode = 1;
});
