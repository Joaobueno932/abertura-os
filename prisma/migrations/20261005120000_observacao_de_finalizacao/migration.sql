-- Observacao de finalizacao: obrigatoria ao concluir uma OS ou um chamado.
-- Nullable porque os registros ja encerrados antes desta mudanca nao a tem, e
-- porque ela e zerada quando o registro e retrocedido (o historico guarda qual era).

-- AlterTable
ALTER TABLE "ServiceOrder" ADD COLUMN     "completionNote" TEXT;

-- AlterTable
ALTER TABLE "UtilityTicket" ADD COLUMN     "completionNote" TEXT;
