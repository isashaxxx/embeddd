import { describe, expect, it } from 'vitest';
import { slugify, uid } from './db';

describe('slugify', () => {
  it('lowercases and replaces non-alphanumerics with hyphens', () => {
    expect(slugify('Hello World')).toBe('hello-world');
    expect(slugify('Foo_Bar!!Baz')).toBe('foo-bar-baz');
  });

  it('trims leading/trailing hyphens', () => {
    expect(slugify('  Hello World!  ')).toBe('hello-world');
    expect(slugify('---test---')).toBe('test');
  });

  it('transliterates Cyrillic characters', () => {
    expect(slugify('Привет мир')).toBe('privet-mir');
    expect(slugify('Ёлка')).toBe('yolka');
  });

  it('falls back to "item" for input that has no representable characters', () => {
    expect(slugify('!!!')).toBe('item');
    expect(slugify('')).toBe('item');
  });

  it('caps length at 54 characters', () => {
    const long = 'a'.repeat(100);
    expect(slugify(long).length).toBeLessThanOrEqual(54);
  });
});

describe('uid', () => {
  it('produces non-empty, url-safe, distinct ids', () => {
    const a = uid();
    const b = uid();
    expect(a).toMatch(/^[a-z0-9]+$/);
    expect(a.length).toBeGreaterThan(0);
    expect(a).not.toBe(b);
  });
});
