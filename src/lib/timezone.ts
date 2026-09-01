/**
 * Fuso horario de negocio. Precisa estar disponivel tanto no servidor quanto no
 * navegador (o Kanban destaca atrasos no cliente), por isso usa uma variavel
 * NEXT_PUBLIC_, que o Next injeta nos dois ambientes.
 */
export const APP_TIMEZONE = process.env.NEXT_PUBLIC_APP_TIMEZONE?.trim() || 'America/Campo_Grande';
