import { prepareProof, type ImageAdapter } from './images';

test('prepared proof is a supported image no wider than 1600 pixels', async () => {
  const encode = vi.fn().mockResolvedValue(new Blob(['compressed'], { type: 'image/webp' }));
  const adapter: ImageAdapter = { decode: vi.fn().mockResolvedValue({ width: 3200, height: 1800, source: {} }), encode };
  const blob = await prepareProof(new File(['image'], 'gym.jpg', { type: 'image/jpeg' }), adapter);
  expect(encode).toHaveBeenCalledWith({}, 1600, 900);
  expect(blob.type).toBe('image/webp');
});

test('non-image proof is rejected before decoding', async () => {
  const adapter: ImageAdapter = { decode: vi.fn(), encode: vi.fn() };
  await expect(prepareProof(new File(['text'], 'note.txt', { type: 'text/plain' }), adapter)).rejects.toThrow('JPEG, PNG, or WebP');
  expect(adapter.decode).not.toHaveBeenCalled();
});
