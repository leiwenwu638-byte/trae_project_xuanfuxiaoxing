import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_SOUND_URL, resolveSoundSrc } from './soundSource';

describe('resolveSoundSrc', () => {
  it('returns null for null / undefined / empty string', () => {
    expect(resolveSoundSrc(null)).toBeNull();
    expect(resolveSoundSrc(undefined)).toBeNull();
    expect(resolveSoundSrc('')).toBeNull();
  });

  it('maps the "default" sentinel to the public default audio asset', () => {
    expect(resolveSoundSrc('default')).toBe(DEFAULT_SOUND_URL);
    expect(DEFAULT_SOUND_URL).toBe('/sound-default.wav');
  });

  it('passes http / https / data / blob / root-relative URLs through unchanged', () => {
    const cases = [
      'https://cdn.example.com/ding.mp3',
      'http://localhost:5173/abc.wav',
      'data:audio/wav;base64,AAA',
      'blob:http://localhost/abc',
      '/relative/from/public.wav'
    ];
    for (const url of cases) {
      expect(resolveSoundSrc(url)).toBe(url);
    }
  });

  it('rewrites absolute local paths through convertFileSrc', () => {
    const convert = vi.fn((p: string) => `asset://localhost/${p}`);
    const out = resolveSoundSrc('C:\\Users\\me\\sounds\\x.wav', convert);
    expect(convert).toHaveBeenCalledWith('C:\\Users\\me\\sounds\\x.wav');
    expect(out).toBe('asset://localhost/C:\\Users\\me\\sounds\\x.wav');
  });

  it('does not call convertFileSrc for safe URL schemes', () => {
    const convert = vi.fn();
    resolveSoundSrc('https://example.com/x.wav', convert);
    resolveSoundSrc('/x.wav', convert);
    resolveSoundSrc('data:audio/wav;base64,AAA', convert);
    expect(convert).not.toHaveBeenCalled();
  });
});
