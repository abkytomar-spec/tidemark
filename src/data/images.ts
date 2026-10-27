export type DecodedImage = { width: number; height: number; source: unknown };
export type ImageAdapter = {
  decode(file: File): Promise<DecodedImage>;
  encode(source: unknown, width: number, height: number): Promise<Blob>;
};

const allowed = ['image/jpeg', 'image/png', 'image/webp'];

export async function prepareProof(file: File, adapter: ImageAdapter = browserAdapter): Promise<Blob> {
  if (!allowed.includes(file.type)) throw new Error('Choose a JPEG, PNG, or WebP image.');
  if (file.size > 20 * 1024 * 1024) throw new Error('Choose a photo smaller than 20 MB.');
  const image = await adapter.decode(file);
  const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
  return adapter.encode(image.source, Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
}

const browserAdapter: ImageAdapter = {
  async decode(file) {
    const source = await createImageBitmap(file, { imageOrientation: 'from-image' });
    return { width: source.width, height: source.height, source };
  },
  async encode(source, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser cannot prepare the photo.');
    context.drawImage(source as CanvasImageSource, 0, 0, width, height);
    (source as ImageBitmap).close?.();
    return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('This photo could not be prepared.')), 'image/webp', 0.78));
  },
};
