export function installCameraMock(getUserMedia = vi.fn().mockResolvedValue(mediaStream()), readyState = 1) {
  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoWidth', { value: 640, configurable: true });
  Object.defineProperty(HTMLVideoElement.prototype, 'videoHeight', { value: 480, configurable: true });
  Object.defineProperty(HTMLVideoElement.prototype, 'readyState', { value: readyState, configurable: true });
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: vi.fn(() => ({ drawImage: vi.fn() })), configurable: true });
  Object.defineProperty(HTMLCanvasElement.prototype, 'toBlob', { value: vi.fn(function (callback: BlobCallback, type?: string) { callback(new Blob(['camera'], { type: type ?? 'image/jpeg' })); }), configurable: true });
  Object.defineProperty(globalThis, 'createImageBitmap', { value: vi.fn().mockResolvedValue({ width: 640, height: 480, close: vi.fn() }), configurable: true });
  return getUserMedia;
}

export function mediaStream(stop = vi.fn()): MediaStream {
  return { getTracks: () => [{ stop }] } as unknown as MediaStream;
}
