-- ==============================================================================
-- SISTEMA DE CHAMADOS UNOPAR - AJUSTE DA RESTRIÇÃO DE SITUAÇÃO (RASCUNHO)
-- Executar no SQL Server Management Studio (SSMS) no banco ChamadosUnopar
-- ==============================================================================
USE [ChamadosUnopar];
GO

PRINT '=== Atualizando restrição de validação de situação para aceitar rascunho ===';

-- 1. Remover a restrição antiga que permitia apenas ('aguardando', 'concluido', 'encerrado')
IF EXISTS (
    SELECT 1 FROM sys.check_constraints 
    WHERE name = 'ck_chamados_situacao' AND parent_object_id = OBJECT_ID('dados.chamados')
)
BEGIN
    ALTER TABLE dados.chamados DROP CONSTRAINT ck_chamados_situacao;
    PRINT 'Restrição antiga ck_chamados_situacao removida com sucesso.';
END
GO

-- 2. Adicionar nova restrição permitindo ('aguardando', 'concluido', 'encerrado', 'rascunho', 'escalonado')
ALTER TABLE dados.chamados ADD CONSTRAINT ck_chamados_situacao
    CHECK (situacao IN ('aguardando', 'concluido', 'encerrado', 'rascunho', 'escalonado'));
GO

PRINT 'Nova restrição ck_chamados_situacao aplicada com sucesso incluindo "rascunho"!';
GO
