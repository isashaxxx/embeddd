export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function isValidAccessMode(value: unknown): value is 'private' | 'link' {
  return value === 'private' || value === 'link';
}
