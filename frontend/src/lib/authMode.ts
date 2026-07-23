export type LoginProvider = 'gateway' | 'local';

export function resolveLoginProvider(value: unknown): LoginProvider {
  if (typeof value === 'string' && value.trim().toLowerCase() === 'local') {
    return 'local';
  }
  return 'gateway';
}

export const LOGIN_PROVIDER = resolveLoginProvider(import.meta.env.VITE_LOGIN_PROVIDER);
