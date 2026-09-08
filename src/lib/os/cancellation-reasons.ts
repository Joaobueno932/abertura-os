/**
 * Motivos de cancelamento de fabrica. Constantes puras, sem acesso a banco,
 * para poderem ser reutilizadas pelo seed e pelos testes.
 *
 * Os motivos vigentes ficam no banco (tabela CancellationReason) e podem ser
 * ampliados por um administrador em /admin/motivos-cancelamento - estes sao
 * apenas os que o sistema garante existir.
 */
export const DEFAULT_CANCELLATION_REASONS = [
  'Problema resolvido remotamente',
  'Não autorizado pelo cliente',
  'A pedido da gerência',
] as const;
