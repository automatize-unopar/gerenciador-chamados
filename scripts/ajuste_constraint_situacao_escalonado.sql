-- Executar no banco SQL Server usado pela aplicação, antes de publicar Escalonado.
-- Mantém os registros existentes e desfaz toda a alteração se a validação falhar.
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;
    IF OBJECT_ID(N'dados.chamados', N'U') IS NULL
        THROW 51000, 'Tabela dados.chamados não encontrada no banco selecionado.', 1;

    IF EXISTS (SELECT 1 FROM sys.check_constraints
               WHERE parent_object_id = OBJECT_ID(N'dados.chamados')
                 AND name = N'ck_chamados_situacao')
        ALTER TABLE dados.chamados DROP CONSTRAINT ck_chamados_situacao;

    ALTER TABLE dados.chamados WITH CHECK ADD CONSTRAINT ck_chamados_situacao
        CHECK (situacao IN ('aguardando', 'concluido', 'encerrado', 'rascunho', 'escalonado'));
    ALTER TABLE dados.chamados CHECK CONSTRAINT ck_chamados_situacao;
    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;

SELECT name, definition, is_disabled, is_not_trusted
FROM sys.check_constraints
WHERE parent_object_id = OBJECT_ID(N'dados.chamados')
  AND name = N'ck_chamados_situacao';