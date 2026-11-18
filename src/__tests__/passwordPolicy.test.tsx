import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { passwordError, unmetPasswordRules } from '@/lib/passwordPolicy';
import PasswordRules from '@/features/auth/PasswordRules';

describe('password policy', () => {
  it('accepts a password with 16+ characters, lower, upper, number and special', () => {
    expect(passwordError('Correct-Horse-Battery9')).toBeNull();
    expect(unmetPasswordRules('Abcdefghijklmn1!')).toEqual([]); // exactly 16
  });

  it('names each thing that is missing', () => {
    expect(unmetPasswordRules('Abcdefghijklm1!').map(r => r.id)).toEqual(['length']); // 15
    expect(unmetPasswordRules('ABCDEFGHIJKLMN1!').map(r => r.id)).toEqual(['lower']);
    expect(unmetPasswordRules('abcdefghijklmn1!').map(r => r.id)).toEqual(['upper']);
    expect(unmetPasswordRules('Abcdefghijklmno!').map(r => r.id)).toEqual(['number']);
    expect(unmetPasswordRules('Abcdefghijklmn12').map(r => r.id)).toEqual(['special']);
    expect(unmetPasswordRules('abc').map(r => r.id)).toEqual(['length', 'upper', 'number', 'special']);
  });

  it('does not count a space as a special character', () => {
    expect(unmetPasswordRules('Abcdefg hijklmn1').map(r => r.id)).toEqual(['special']);
  });

  it('says what is missing in one sentence', () => {
    expect(passwordError('')).toBe('Please enter a password.');
    expect(passwordError('Abcdefghijklmn12')).toBe('Your password needs one special character.');
    expect(passwordError('abcdefgh')).toBe('Your password needs at least 16 characters, one uppercase letter, one number and one special character.');
  });
});

describe('PasswordRules', () => {
  it('lists all five requirements and marks the ones met', () => {
    render(<PasswordRules password="abcdefghijklmnop" />);
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(5);
    expect(items.map(i => i.getAttribute('data-met'))).toEqual(['true', 'true', 'false', 'false', 'false']);
  });
});
