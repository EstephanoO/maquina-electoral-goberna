import { test, expect } from 'bun:test';
import { isDemoPhone } from '../whatsapp-otp';

test('isDemoPhone matches the configured demo phone, normalized', () => {
  expect(isDemoPhone('999000001', '999000001')).toBe(true);
  expect(isDemoPhone('+51 999 000 001', '999000001')).toBe(true);
  expect(isDemoPhone('987654321', '999000001')).toBe(false);
  expect(isDemoPhone('999000001', '')).toBe(false);
});
