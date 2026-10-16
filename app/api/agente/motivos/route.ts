import { NextRequest, NextResponse } from "next/server";
import { autenticarAgente } from "@/lib/agente/auth";
import { comUsuario } from "@/lib/db/comUsuario";

export const dynamic = "force-dynamic";

/**
 * GET /api/agente/motivos
 * Catálogo de motivos ativos com o caminho no PAD (coluna filtro), para a triagem do agente.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await autenticarAgente(request);
    if ("resposta" in auth) return auth.resposta;
    const { perfil } = auth;

    const motivos = await comUsuario({ usuario_id: perfil.id, papel: perfil.papel }, async (req) => {
      const q = await req.query(`
          SELECT
            CAST(id AS NVARCHAR(50)) AS id,
            codigo,
            nome,
            filtro
          FROM dados.motivos
          WHERE ativo = 1
          ORDER BY numero
        `);
      return q.recordset;
    });

    return NextResponse.json({ motivos });
  } catch (error) {
    console.error("[ERRO_API_AGENTE_MOTIVOS]:", error);
    return NextResponse.json({ erro: "Erro ao listar motivos." }, { status: 500 });
  }
}
