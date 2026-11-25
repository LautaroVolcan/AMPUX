import { describe, expect, it } from 'vitest';
import { emailToUsername, usernameToEmail, USER_DOMAIN } from '../src/storage/auth';

describe('Login con usuario', () => {
  it('el usuario se convierte en un email del dominio propio', () => {
    expect(usernameToEmail('lautaro')).toBe(`lautaro@${USER_DOMAIN}`);
    expect(usernameToEmail('  Lautaro ')).toBe(`lautaro@${USER_DOMAIN}`);
  });
  it('un email completo se usa tal cual', () => {
    expect(usernameToEmail('Ana@Ejemplo.com')).toBe('ana@ejemplo.com');
  });
  it('y vuelve a mostrarse como usuario', () => {
    expect(emailToUsername(`lautaro@${USER_DOMAIN}`)).toBe('lautaro');
    expect(emailToUsername('ana@ejemplo.com')).toBe('ana@ejemplo.com');
    expect(emailToUsername(undefined)).toBe('');
  });
});
