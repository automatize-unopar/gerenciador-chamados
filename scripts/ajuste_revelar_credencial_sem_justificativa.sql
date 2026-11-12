-- ==============================================================================
-- SISTEMA DE CHAMADOS UNOPAR - AJUSTE REVELAR CREDENCIAL SEM JUSTIFICATIVA
-- Executar no SQL Server Management Studio (SSMS) no banco ChamadosUnopar
-- Permite que Administradores revelem senhas do cofre sem obrigatoriedade de justificativa
-- ==============================================================================

USE [ChamadosUnopar];
GO

PRINT '=== Atualizando dados.revelar_credencial para permitir acesso sem justificativa ===';
GO

-- Verifica se a tabela auditoria.credencial_acessos possui a coluna justificativa
DECLARE @temColunaJustificativa BIT = 0;
IF EXISTS (
    SELECT 1 
    FROM sys.columns 
    WHERE object_id = OBJECT_ID('auditoria.credencial_acessos') 
      AND name = 'justificativa'
)
BEGIN
    SET @temColunaJustificativa = 1;
END;

-- Recria a procedure aceitando justificativa como opcional e sem exigir tamanho mínimo para admin
CREATE OR ALTER PROCEDURE dados.revelar_credencial
    @perfil_alvo   UNIQUEIDENTIFIER,
    @justificativa NVARCHAR(500) = NULL,
    @ip            VARCHAR(45)   = NULL,
    @user_agent    NVARCHAR(400) = NULL
AS
BEGIN
    SET NOCOUNT ON;

    DECLARE @uid   UNIQUEIDENTIFIER = CAST(SESSION_CONTEXT(N'usuario_id') AS UNIQUEIDENTIFIER);
    DECLARE @papel VARCHAR(20)      = CAST(SESSION_CONTEXT(N'papel') AS VARCHAR(20));

    -- Validação de contexto
    IF @uid IS NULL
        THROW 51010, 'Contexto de usuario ausente.', 1;

    -- Confirma se é administradora ativa no banco
    DECLARE @papel_real VARCHAR(20) = (SELECT papel FROM dados.perfis WHERE id = @uid AND ativo = 1);
    IF @papel_real <> 'admin'
        THROW 51011, 'Apenas administradores podem revelar credenciais.', 1;

    -- Justificativa padrão para auditoria caso não informada
    DECLARE @justificativa_final NVARCHAR(500) = ISNULL(NULLIF(TRIM(@justificativa), ''), 'Visualizacao direta por Administrador');

    -- Registra o acesso em auditoria.credencial_acessos
    IF EXISTS (
        SELECT 1 FROM sys.columns 
        WHERE object_id = OBJECT_ID('auditoria.credencial_acessos') AND name = 'justificativa'
    )
    BEGIN
        EXEC sp_executesql 
            N'INSERT INTO auditoria.credencial_acessos (perfil_alvo, admin_id, justificativa, ip, user_agent)
              VALUES (@p_alvo, @p_admin, @p_just, @p_ip, @p_ua);',
            N'@p_alvo UNIQUEIDENTIFIER, @p_admin UNIQUEIDENTIFIER, @p_just NVARCHAR(500), @p_ip VARCHAR(45), @p_ua NVARCHAR(400)',
            @p_alvo = @perfil_alvo,
            @p_admin = @uid,
            @p_just = @justificativa_final,
            @p_ip = @ip,
            @p_ua = @user_agent;
    END
    ELSE
    BEGIN
        INSERT INTO auditoria.credencial_acessos (perfil_alvo, admin_id, ip, user_agent)
        VALUES (@perfil_alvo, @uid, @ip, @user_agent);
    END;

    -- Devolve os bytes cifrados da credencial para decifrar no Node.js
    SELECT senha_cifrada, iv, auth_tag
    FROM dados.credenciais_externas
    WHERE perfil_id = @perfil_alvo;
END;
GO

PRINT 'Procedure dados.revelar_credencial atualizada com sucesso!';
GO
