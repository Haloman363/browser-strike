import { describe, it, expect } from 'vitest';
import { generateLobbyCode, isValidLobbyCode } from './LobbyUtils';

describe('LobbyUtils', () => {
  describe('generateLobbyCode', () => {
    it('should return a 6-character string', () => {
      const code = generateLobbyCode();
      expect(code).toHaveLength(6);
    });

    it('should be alphanumeric', () => {
      const code = generateLobbyCode();
      expect(code).toMatch(/^[a-zA-Z0-9]+$/);
    });

    it('should generate different codes (mostly)', () => {
      const code1 = generateLobbyCode();
      const code2 = generateLobbyCode();
      expect(code1).not.toBe(code2);
    });
  });

  describe('isValidLobbyCode', () => {
    it('should return true for valid 6-char alphanumeric codes', () => {
      expect(isValidLobbyCode('A1B2C3')).toBe(true);
      expect(isValidLobbyCode('abcdef')).toBe(true);
      expect(isValidLobbyCode('123456')).toBe(true);
    });

    it('should return false for codes with invalid length', () => {
      expect(isValidLobbyCode('A1B2C')).toBe(false);
      expect(isValidLobbyCode('A1B2C34')).toBe(false);
    });

    it('should return false for non-alphanumeric codes', () => {
      expect(isValidLobbyCode('A1B2C!')).toBe(false);
      expect(isValidLobbyCode('A1B2 C')).toBe(false);
    });
  });
});
