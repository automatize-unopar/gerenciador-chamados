"use server";

import { z } from "zod";
import bcrypt from "bcryptjs";
import { redirect } from "next/navigation";
import { getPool, resetPool, sql } from "@/lib/db/pool";
import { criarSessao, destruirSessao } from "@/lib/auth/jwt";

const loginSchema = z.object({
  email: z.string().email("Informe um endereço de e-mail válido."),
  senha: z.string().min(1, "Informe a senha de acesso."),
});

export type EstadoLogin = {
  erro?: string;
  sucesso?: boolean;
};

export async function autenticarUsuario(
  _estadoAnterior: EstadoLogin,
  formData: FormData
): Promise<EstadoLogin> {
  const dados = {
    email: formData.get("email"),
    senha: formData.get("senha"),
  };

  const validacao = loginSchema.safeParse(dados);
  if (!validacao.success) {
    return {
      erro: validacao.error.issues[0]?.message ?? "Dados de formulário inválidos.",
    };
  }

  const { email, senha } = validacao.data;
  let perfil: any = null;

  try {
    const pool = await getPool();
    const request = pool.request();

    const resultado = await request.input("email", sql.VarChar(255), email.toLowerCase().trim())
      .query(`
        SELECT 
          CAST(p.id AS NVARCHAR(50)) AS id,
          p.nome_completo,
          p.email,
          p.papel,
          p.ativo,
          p.senha_hash,
          CAST(p.polo_id AS NVARCHAR(50)) AS polo_id,
          pol.nome AS polo_nome
        FROM dados.perfis p
        LEFT JOIN dados.polos pol ON pol.id = p.polo_id
        WHERE p.email = @email
      `);

    perfil = resultado.recordset[0];
  } catch (errDb: any) {
    resetPool();
    console.error("Erro ao consultar banco no login (tentativa 1):", errDb);

    // Tenta uma segunda vez com pool recém-criado
    try {
      const pool2 = await getPool();
      const request2 = pool2.request();
      const resultado2 = await request2.input("email", sql.VarChar(255), email.toLowerCase().trim())
        .query(`
          SELECT 
            CAST(p.id AS NVARCHAR(50)) AS id,
            p.nome_completo,
            p.email,
            p.papel,
            p.ativo,
            p.senha_hash,
            CAST(p.polo_id AS NVARCHAR(50)) AS polo_id,
            pol.nome AS polo_nome
          FROM dados.perfis p
          LEFT JOIN dados.polos pol ON pol.id = p.polo_id
          WHERE p.email = @email
        `);
      perfil = resultado2.recordset[0];
    } catch (errDb2: any) {
      resetPool();
      console.error("Erro ao consultar banco no login (tentativa 2):", errDb2);
      const msg = errDb2?.message || errDb?.message || "";
      if (msg.includes("Login failed for user")) {
        return {
          erro: "Falha de autenticação com o banco de dados SQL Server (verifique usuário e senha no painel da Vercel).",
        };
      }
      return {
        erro: `Falha ao conectar com o banco de dados (${msg || "tempo esgotado"}). Verifique a conectividade de rede e as credenciais.`,
      };
    }
  }

  // Mensagem genérica para não revelar existência de e-mail
  const mensagemErroGenerico =
    "E-mail ou senha incorretos. Verifique suas credenciais e tente novamente.";

  if (!perfil) {
    return { erro: mensagemErroGenerico };
  }

  // Verifica se a conta está ativa
  if (!perfil.ativo) {
    return { erro: "Esta conta foi desativada pela coordenação ou administração." };
  }

  // Senhas com valor provisório exigem definição inicial
  if (!perfil.senha_hash || perfil.senha_hash === "PROVISORIO_TROCAR_VIA_APP") {
    return {
      erro: "Senha inicial ainda não definida para este usuário. Solicite à administração a definição da senha.",
    };
  }

  const senhaValida = await bcrypt.compare(senha, perfil.senha_hash);

  if (!senhaValida) {
    return { erro: mensagemErroGenerico };
  }

  await criarSessao({
    id: perfil.id,
    email: perfil.email,
    nome_completo: perfil.nome_completo,
    papel: perfil.papel,
    polo_id: perfil.polo_id || null,
    polo_nome: perfil.polo_nome || null,
  });

  redirect("/painel");
}

export async function logoutUsuario() {
  await destruirSessao();
  redirect("/login");
}
