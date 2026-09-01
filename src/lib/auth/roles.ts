export const ROLES = ['USER', 'ADMIN'] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export function isAdmin(role: string): boolean {
  return role === 'ADMIN';
}

export const ROLE_LABEL: Record<Role, string> = {
  USER: 'Usuário',
  ADMIN: 'Administrador',
};
