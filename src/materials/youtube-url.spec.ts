import { normalizeYoutubeEmbedUrl } from './youtube-url';

describe('normalizeYoutubeEmbedUrl', () => {
  it.each([
    [
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ],
    [
      'www.youtube.com/watch?feature=shared&v=dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ],
    [
      'https://youtu.be/dQw4w9WgXcQ?si=shared-link',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ],
    [
      '//m.youtube.com/watch?si=shared-link&v=dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ],
    [
      'https://music.youtube.com/watch?v=dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ],
    [
      'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ],
    [
      'https://www.youtube.com/live/dQw4w9WgXcQ?feature=shared',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ],
    [
      'https://www.youtube.com/embed/dQw4w9WgXcQ?si=shared-link',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ],
    [
      'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ],
    [
      'https://www.youtube.com/v/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ],
    [
      'https://www.youtube.com/e/dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ],
    [
      'https://www.youtube.com/attribution_link?u=%2Fwatch%3Fv%3DdQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ],
    [
      'https://www.youtube.com/redirect?q=https%3A%2F%2Fyoutu.be%2FdQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ],
    [
      'dQw4w9WgXcQ',
      'https://www.youtube.com/embed/dQw4w9WgXcQ',
    ],
  ])('normalizes %s', (input, expected) => {
    expect(normalizeYoutubeEmbedUrl(input)).toBe(expected);
  });

  it('keeps non-YouTube URLs unchanged', () => {
    const url = 'https://example.com/embed/video';

    expect(normalizeYoutubeEmbedUrl(url)).toBe(url);
  });

  it('keeps empty values unchanged', () => {
    expect(normalizeYoutubeEmbedUrl(undefined)).toBeUndefined();
    expect(normalizeYoutubeEmbedUrl(null)).toBeNull();
    expect(normalizeYoutubeEmbedUrl('  ')).toBe('');
  });
});
