import { describe, expect, it } from 'vitest';
import { HEX_COLOR, isValidAccessMode } from './validation';

describe('HEX_COLOR', () => {
  it('accepts 6-digit hex colors, case-insensitive', () => {
    expect(HEX_COLOR.test('#C6F04A')).toBe(true);
    expect(HEX_COLOR.test('#c6f04a')).toBe(true);
    expect(HEX_COLOR.test('#000000')).toBe(true);
    expect(HEX_COLOR.test('#FFFFFF')).toBe(true);
  });

  it('rejects everything that is not a bare 6-digit hex color', () => {
    expect(HEX_COLOR.test('C6F04A')).toBe(false); // missing #
    expect(HEX_COLOR.test('#FFF')).toBe(false); // 3-digit shorthand
    expect(HEX_COLOR.test('#GGGGGG')).toBe(false); // invalid hex digits
    expect(HEX_COLOR.test('red')).toBe(false); // named color
    expect(HEX_COLOR.test('')).toBe(false);
    expect(HEX_COLOR.test('#12345')).toBe(false); // too short
    expect(HEX_COLOR.test('#1234567')).toBe(false); // too long
  });
});

describe('isValidAccessMode', () => {
  it('accepts only "private" and "link"', () => {
    expect(isValidAccessMode('private')).toBe(true);
    expect(isValidAccessMode('link')).toBe(true);
  });

  it('rejects anything else, including undefined/null/other types', () => {
    expect(isValidAccessMode('public')).toBe(false);
    expect(isValidAccessMode('')).toBe(false);
    expect(isValidAccessMode(undefined)).toBe(false);
    expect(isValidAccessMode(null)).toBe(false);
    expect(isValidAccessMode(1)).toBe(false);
    expect(isValidAccessMode({})).toBe(false);
  });
});
