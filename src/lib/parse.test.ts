import { describe, expect, it } from 'vitest';
import { parseLink } from './parse';

describe('parseLink — SSRF hardening', () => {
  it('rejects localhost and loopback in every spelling', () => {
    expect(parseLink('http://localhost/x')).toBeNull();
    expect(parseLink('http://localhost.localhost/x')).toBeNull();
    expect(parseLink('http://foo.localhost/x')).toBeNull();
    expect(parseLink('http://foo.local/x')).toBeNull();
    expect(parseLink('http://127.0.0.1/x')).toBeNull();
    expect(parseLink('http://127.1.2.3/x')).toBeNull();
    expect(parseLink('http://0.0.0.0/x')).toBeNull();
    expect(parseLink('http://[::1]/x')).toBeNull();
  });

  it('rejects private IPv4 ranges (10/8, 172.16/12, 192.168/16, link-local)', () => {
    expect(parseLink('http://10.0.0.5/x')).toBeNull();
    expect(parseLink('http://172.16.0.1/x')).toBeNull();
    expect(parseLink('http://172.31.255.255/x')).toBeNull();
    expect(parseLink('http://192.168.1.1/x')).toBeNull();
    expect(parseLink('http://169.254.169.254/x')).toBeNull(); // cloud metadata endpoint
  });

  it('does not reject adjacent public ranges (172.15/172.32, edges of 172.16/12)', () => {
    expect(parseLink('http://172.15.0.1/x')).not.toBeNull();
    expect(parseLink('http://172.32.0.1/x')).not.toBeNull();
  });

  it('rejects private IPv6 ranges (unique-local fc00::/7, link-local fe80::/10)', () => {
    expect(parseLink('http://[fc00::1]/x')).toBeNull();
    expect(parseLink('http://[fd12::1]/x')).toBeNull();
    expect(parseLink('http://[fe80::1]/x')).toBeNull();
  });

  it('rejects credentials embedded in the URL', () => {
    expect(parseLink('http://user:pass@example.com/x')).toBeNull();
  });

  it('rejects non-http(s) protocols', () => {
    expect(parseLink('ftp://example.com/x')).toBeNull();
    expect(parseLink('javascript:alert(1)')).toBeNull();
    expect(parseLink('file:///etc/passwd')).toBeNull();
  });

  it('accepts an ordinary public https URL', () => {
    expect(parseLink('https://example.com/page')).not.toBeNull();
  });
});

describe('parseLink — protocol normalization', () => {
  it('adds https:// to bare host/path input', () => {
    const parsed = parseLink('example.com/page');
    expect(parsed?.url).toBe('https://example.com/page');
  });

  it('leaves an explicit http:// URL as http', () => {
    const parsed = parseLink('http://example.com/page');
    expect(parsed?.url.startsWith('http://')).toBe(true);
  });

  it('strips a leading www. from the reported host', () => {
    expect(parseLink('https://www.example.com/page')?.host).toBe('example.com');
  });
});

describe('parseLink — provider detection', () => {
  it('detects a YouTube watch URL', () => {
    const parsed = parseLink('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(parsed?.kind).toBe('embed');
    expect(parsed?.provider).toBe('youtube');
    expect(parsed?.embedUrl).toContain('dQw4w9WgXcQ');
  });

  it('detects a youtu.be short link', () => {
    const parsed = parseLink('https://youtu.be/dQw4w9WgXcQ');
    expect(parsed?.provider).toBe('youtube');
    expect(parsed?.embedUrl).toContain('dQw4w9WgXcQ');
  });

  it('falls back to a plain link when a YouTube URL has no video id', () => {
    const parsed = parseLink('https://www.youtube.com/');
    expect(parsed?.kind).toBe('link');
  });

  it('detects a Vimeo URL', () => {
    const parsed = parseLink('https://vimeo.com/123456789');
    expect(parsed?.kind).toBe('embed');
    expect(parsed?.provider).toBe('vimeo');
  });

  it('detects a Pinterest pin as an embed, and a bare Pinterest URL as a link', () => {
    expect(parseLink('https://www.pinterest.com/pin/123456789/')?.kind).toBe('embed');
    expect(parseLink('https://www.pinterest.com/someuser/')?.kind).toBe('link');
  });

  it('detects Instagram, TikTok, X/Twitter, Figma and Spotify', () => {
    expect(parseLink('https://www.instagram.com/p/ABC123/')?.provider).toBe('instagram');
    expect(parseLink('https://www.tiktok.com/@user/video/123456')?.provider).toBe('tiktok');
    expect(parseLink('https://x.com/user/status/123456')?.provider).toBe('x');
    expect(parseLink('https://www.figma.com/file/abc/Test')?.provider).toBe('figma');
    expect(parseLink('https://open.spotify.com/track/abc123')?.provider).toBe('spotify');
  });

  it('detects direct image and video links by extension', () => {
    expect(parseLink('https://cdn.example.com/photo.jpg')?.kind).toBe('image');
    expect(parseLink('https://cdn.example.com/photo.PNG')?.kind).toBe('image');
    expect(parseLink('https://cdn.example.com/clip.mp4')?.kind).toBe('video');
  });

  it('falls back to a generic link for anything else', () => {
    const parsed = parseLink('https://example.com/some/article');
    expect(parsed?.kind).toBe('link');
    expect(parsed?.provider).toBe('example.com');
    expect(parsed?.title).toBe('example.com');
  });
});
