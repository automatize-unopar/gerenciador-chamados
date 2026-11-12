"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { obterPerfilAtual } from "@/lib/auth/perfil";
import { comUsuario } from "@/lib/db/comUsuario";
import { sql } from "@/lib/db/pool";
import { cifrarSenha, decifrarSenha } from "@/lib/crypto/cofre";

export async function revelarSenhaExternaAction(
  perfilIdAlvo: string
): Promise<{ sucesso: true; senhaPlana: string } | { sucesso: false; erro: string }> {
  try {
    const perfil = await obterPerfilAtual();
    if (perfil.papel !== "admin") {
      return {
        sucesso: false,
        erro: "Apenas administradores podem visualizar senhas da plataforma externa.",
      };
    }

    // 1. Obter IP e User Agent para auditoria
    const headerList = await headers();
    const ip =
      headerList.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      headerList.get("x-real-ip") ||
      "127.0.0.1";
    const userAgent = headerList.get("user-agent") || "Desconhecido";

    const cred = await comUsuario({ usuario_id: perfil.id, papel: perfil.papel }, async (req) => {
      const res = await req
        .input("perfil_alvo", sql.VarChar(50), perfilIdAlvo)
        .input("justificativa", sql.NVarChar(200), "Visualização pelo Administrador")
        .input("ip", sql.VarChar(45), ip.slice(0, 45))
        .input("user_agent", sql.NVarChar(400), userAgent.slice(0, 400))
        .execute("dados.revelar_credencial");

      return res.recordset[0];
    });

    if (!cred) {
      return {
        sucesso: false,
        erro: "Nenhuma credencial cadastrada para este usuário no cofre.",
      };
    }

    const senhaPlana = decifrarSenha(
      Buffer.from(cred.senha_cifrada),
      Buffer.from(cred.iv),
      Buffer.from(cred.auth_tag)
    );

    return { sucesso: true, senhaPlana };
  } catch (err: unknown) {
    console.error("Erro ao revelar senha:", err);
    const msg = err instanceof Error ? err.message : "Erro ao decifrar credencial.";
    return { sucesso: false, erro: msg };
  }
}

export async function alternarStatusUsuarioAction(idAlvo: string, novoAtivo: boolean) {
  try {
    const perfil = await obterPerfilAtual();
    if (perfil.papel !== "admin") {
      return { sucesso: false, erro: "Apenas administradores podem alterar o status de usuários." };
    }

    if (perfil.id === idAlvo && !novoAtivo) {
      return {
        sucesso: false,
        erro: "Você não pode desativar sua própria conta de administrador.",
      };
    }

    await comUsuario({ usuario_id: perfil.id, papel: perfil.papel }, async (req) => {
      req.input("id", sql.VarChar(50), idAlvo);
      req.input("ativo", sql.Bit, novoAtivo ? 1 : 0);
      await req.query(`
          UPDATE dados.perfis
          SET ativo = @ativo, atualizado_em = SYSUTCDATETIME()
          WHERE id = @id
        `);
    });

    try {
      revalidatePath("/usuarios");
    } catch {}
    return { sucesso: true };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Erro ao atualizar usuário.";
    return { sucesso: false, erro: msg };
  }
}

// Helper interno isolado para gravar no cofre sem disparar revalidações prematuras
async function gravarCredencialNoCofre(
  adminId: string,
  adminPapel: string,
  perfilIdAlvo: string,
  senhaPlana: string
) {
  const { senhaCifrada, iv, authTag } = cifrarSenha(senhaPlana);

  await comUsuario({ usuario_id: adminId, papel: adminPapel }, async (req) => {
    req.input("perfilId", sql.VarChar(50), perfilIdAlvo);
    req.input("senhaCifrada", sql.VarBinary(sql.MAX), senhaCifrada);
    req.input("iv", sql.VarBinary(12), iv);
    req.input("authTag", sql.VarBinary(16), authTag);
    req.input("atualizadoPor", sql.VarChar(50), adminId);

    await req.query(`
      MERGE dados.credenciais_externas AS target
      USING (SELECT CAST(@perfilId AS UNIQUEIDENTIFIER) AS perfil_id) AS source
      ON target.perfil_id = source.perfil_id
      WHEN MATCHED THEN
        UPDATE SET 
          senha_cifrada = @senhaCifrada,
          iv = @iv,
          auth_tag = @authTag,
          atualizado_em = SYSUTCDATETIME(),
          atualizado_por = CAST(@atualizadoPor AS UNIQUEIDENTIFIER)
      WHEN NOT MATCHED THEN
        INSERT (perfil_id, senha_cifrada, iv, auth_tag, atualizado_em, atualizado_por)
        VALUES (CAST(@perfilId AS UNIQUEIDENTIFIER), @senhaCifrada, @iv, @authTag, SYSUTCDATETIME(), CAST(@atualizadoPor AS UNIQUEIDENTIFIER));
    `);
  });
}

export async function salvarCredencialExternaAction(perfilIdAlvo: string, senhaPlana: string) {
  try {
    const perfil = await obterPerfilAtual();
    const ehAdmin = perfil.papel === "admin";
    const ehPropria = perfil.id === perfilIdAlvo;

    if (!ehAdmin && !ehPropria) {
      return { sucesso: false, erro: "Permissão negada para atualizar esta credencial." };
    }

    await gravarCredencialNoCofre(perfil.id, perfil.papel, perfilIdAlvo, senhaPlana);
    try {
      revalidatePath("/usuarios");
      revalidatePath("/perfil");
    } catch {}
    return { sucesso: true };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Falha ao salvar credencial no cofre.";
    return { sucesso: false, erro: msg };
  }
}

export async function criarOuEditarUsuarioAction(_prevState: unknown, formData: FormData) {
  try {
    const perfil = await obterPerfilAtual();

    if (perfil.papel !== "admin") {
      return { erro: "Apenas administradores podem cadastrar ou editar usuários." };
    }

    const id = formData.get("id") as string | null;
    const nomeCompleto = ((formData.get("nome_completo") as string) || "").trim();
    const email = ((formData.get("email") as string) || "").toLowerCase().trim();
    const papel = formData.get("papel") as "admin" | "coordenador" | "atendente";

    // Sanitização rigorosa de poloId para evitar falhas de conversão de UniqueIdentifier
    const poloIdRaw = formData.get("polo_id") as string | null;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const poloIdValido = poloIdRaw && uuidRegex.test(poloIdRaw.trim()) ? poloIdRaw.trim() : null;

    // Aceita senha enviada de qualquer um dos nomes de campo (padronizado em 'senha')
    const senhaBruta =
      (formData.get("senha") as string | null) ||
      (formData.get("senha_sistema") as string | null) ||
      (formData.get("senha_inicial") as string | null) ||
      (formData.get("senha_externa") as string | null);
    const senha = senhaBruta ? senhaBruta.trim() : null;

    if (!nomeCompleto || !email || !papel) {
      return { erro: "Todos os campos obrigatórios devem ser preenchidos." };
    }

    if (id) {
      // Edição de usuário existente
      if (senha && senha.length < 6) {
        return { erro: "A nova senha deve conter no mínimo 6 caracteres." };
      }

      await comUsuario({ usuario_id: perfil.id, papel: perfil.papel }, async (req) => {
        req.input("id", sql.VarChar(50), id);
        req.input("nome", sql.VarChar(255), nomeCompleto);
        req.input("email", sql.VarChar(255), email);
        req.input("papel", sql.VarChar(50), papel);
        req.input("polo_id", sql.VarChar(50), poloIdValido);

        let updateSenhaSql = "";
        if (senha) {
          const hash = await bcrypt.hash(senha, 10);
          req.input("senhaHash", sql.VarChar(255), hash);
          updateSenhaSql = "senha_hash = @senhaHash, ";
        }

        await req.query(`
            UPDATE dados.perfis
            SET nome_completo = @nome,
                email = @email,
                papel = @papel,
                polo_id = @polo_id,
                ${updateSenhaSql}
                atualizado_em = SYSUTCDATETIME()
            WHERE id = @id
          `);
      });

      // Se a senha foi alterada na edição, sincroniza automaticamente no cofre cifrado
      if (senha) {
        try {
          await gravarCredencialNoCofre(perfil.id, perfil.papel, id, senha);
        } catch (cofreErr) {
          console.error("Aviso ao sincronizar credencial no cofre:", cofreErr);
        }
      }
    } else {
      // Criação de novo usuário: senha é obrigatória (mínimo 6 caracteres)
      if (!senha || senha.length < 6) {
        return { erro: "A senha inicial deve conter no mínimo 6 caracteres." };
      }

      const hash = await bcrypt.hash(senha, 10);

      const novoId = await comUsuario(
        { usuario_id: perfil.id, papel: perfil.papel },
        async (req) => {
          req.input("nome", sql.VarChar(255), nomeCompleto);
          req.input("email", sql.VarChar(255), email);
          req.input("papel", sql.VarChar(50), papel);
          req.input("senhaHash", sql.VarChar(255), hash);
          req.input("polo_id", sql.VarChar(50), poloIdValido);

          const q = await req.query(`
            DECLARE @out TABLE (id UNIQUEIDENTIFIER);

            INSERT INTO dados.perfis (
              nome_completo,
              email,
              papel,
              polo_id,
              ativo,
              senha_hash
            )
            OUTPUT inserted.id INTO @out
            VALUES (
              @nome,
              @email,
              @papel,
              @polo_id,
              1,
              @senhaHash
            );

            SELECT CAST(id AS NVARCHAR(50)) AS id FROM @out;
          `);

          return q.recordset[0]?.id;
        }
      );

      // A senha da plataforma externa É A MESMA do sistema interno,
      // gravada de forma cifrada com AES-256-GCM no cofre para visualização exclusiva do administrador
      if (novoId) {
        try {
          await gravarCredencialNoCofre(perfil.id, perfil.papel, novoId, senha);
        } catch (cofreErr) {
          console.error("Aviso ao salvar credencial no cofre:", cofreErr);
        }
      }
    }

    try {
      revalidatePath("/usuarios");
    } catch (revErr) {
      console.error("Aviso revalidatePath /usuarios:", revErr);
    }

    return { sucesso: true };
  } catch (error: unknown) {
    const rawMsg = error instanceof Error ? error.message : "Erro ao processar usuário.";
    let msgAmigavel = rawMsg;
    if (
      rawMsg.includes("UNIQUE KEY") ||
      rawMsg.includes("duplicate key") ||
      rawMsg.includes("UQ_perfis_email")
    ) {
      msgAmigavel = "Já existe um usuário cadastrado com este e-mail.";
    } else if (rawMsg.includes("Validation failed for parameter")) {
      msgAmigavel = "Dados inválidos informados no formulário.";
    }
    return { erro: msgAmigavel };
  }
}
