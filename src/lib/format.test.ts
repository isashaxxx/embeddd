import { describe, expect, it } from 'vitest';
import { plural } from './format';

describe('plural', () => {
  it('picks the singular form for 1, 21, 31...', () => {
    expect(plural(1, 'карточка', 'карточки', 'карточек')).toBe('карточка');
    expect(plural(21, 'карточка', 'карточки', 'карточек')).toBe('карточка');
    expect(plural(101, 'карточка', 'карточки', 'карточек')).toBe('карточка');
  });

  it('picks the few form for 2-4, 22-24...', () => {
    expect(plural(2, 'карточка', 'карточки', 'карточек')).toBe('карточки');
    expect(plural(3, 'карточка', 'карточки', 'карточек')).toBe('карточки');
    expect(plural(4, 'карточка', 'карточки', 'карточек')).toBe('карточки');
    expect(plural(22, 'карточка', 'карточки', 'карточек')).toBe('карточки');
  });

  it('picks the many form for 0, 5-20, 25...', () => {
    expect(plural(0, 'карточка', 'карточки', 'карточек')).toBe('карточек');
    expect(plural(5, 'карточка', 'карточки', 'карточек')).toBe('карточек');
    expect(plural(11, 'карточка', 'карточки', 'карточек')).toBe('карточек');
    expect(plural(12, 'карточка', 'карточки', 'карточек')).toBe('карточек');
    expect(plural(14, 'карточка', 'карточки', 'карточек')).toBe('карточек');
    expect(plural(25, 'карточка', 'карточки', 'карточек')).toBe('карточек');
  });

  it('handles the 11-14 exception across hundreds (111, 112...)', () => {
    expect(plural(111, 'карточка', 'карточки', 'карточек')).toBe('карточек');
    expect(plural(112, 'карточка', 'карточки', 'карточек')).toBe('карточек');
  });
});
