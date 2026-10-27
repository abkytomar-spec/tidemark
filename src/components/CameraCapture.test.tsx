import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { installCameraMock, mediaStream } from '../test/camera';
import { CameraCapture } from './CameraCapture';

test('captures, retakes, and saves a live frame without a file input', async () => {
  const stop = vi.fn();
  installCameraMock(vi.fn().mockResolvedValue(mediaStream(stop)));
  const onSave = vi.fn();
  render(<CameraCapture onSave={onSave} />);

  expect(await screen.findByLabelText('Live camera preview')).toBeVisible();
  expect(document.querySelector('input[type="file"]')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Capture' }));
  expect(await screen.findByText('Photo ready')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Retake' }));
  expect(screen.getByRole('button', { name: 'Capture' })).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Capture' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Save photo' }));

  expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ name: expect.stringMatching(/\.jpg$/), type: 'image/jpeg' }));
  expect(stop).toHaveBeenCalled();
});

test('switching cameras stops the old stream and unmount stops the new one', async () => {
  const rearStop = vi.fn();
  const frontStop = vi.fn();
  const getUserMedia = vi.fn().mockResolvedValueOnce(mediaStream(rearStop)).mockResolvedValueOnce(mediaStream(frontStop));
  installCameraMock(getUserMedia);
  const view = render(<CameraCapture onSave={vi.fn()} />);
  await screen.findByLabelText('Live camera preview');

  await userEvent.click(screen.getByRole('button', { name: 'Switch to front camera' }));
  await waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(2));
  expect(rearStop).toHaveBeenCalled();
  expect(getUserMedia).toHaveBeenLastCalledWith({ audio: false, video: { facingMode: { ideal: 'user' } } });
  view.unmount();
  expect(frontStop).toHaveBeenCalled();
});

test('permission denial offers a working camera retry', async () => {
  const getUserMedia = vi.fn().mockRejectedValueOnce(new DOMException('Denied', 'NotAllowedError')).mockResolvedValueOnce(mediaStream());
  installCameraMock(getUserMedia);
  render(<CameraCapture onSave={vi.fn()} />);
  expect(await screen.findByText('Camera permission was denied. Allow camera access and try again.')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Try camera again' }));
  expect(await screen.findByLabelText('Live camera preview')).toBeVisible();
});

test.each([
  ['NotFoundError', 'No camera was found on this device.'],
  ['NotReadableError', 'The camera could not start. Close other camera apps and try again.'],
])('shows specific recovery for %s', async (name, message) => {
  installCameraMock(vi.fn().mockRejectedValue(new DOMException('Camera error', name)));
  render(<CameraCapture onSave={vi.fn()} />);
  expect(await screen.findByText(message)).toBeVisible();
});

test('reports insecure and unsupported browsers without opening a picker', async () => {
  installCameraMock();
  Object.defineProperty(window, 'isSecureContext', { value: false, configurable: true });
  const insecure = render(<CameraCapture onSave={vi.fn()} />);
  expect(await screen.findByText('Live camera capture needs a secure connection.')).toBeVisible();
  insecure.unmount();

  Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  Object.defineProperty(navigator, 'mediaDevices', { value: undefined, configurable: true });
  render(<CameraCapture onSave={vi.fn()} />);
  expect(await screen.findByText('This browser does not support live camera capture.')).toBeVisible();
  expect(document.querySelector('input[type="file"]')).toBeNull();
});

test('retake discards the frame previously confirmed by the parent', async () => {
  installCameraMock();
  const onDiscard = vi.fn();
  const props = { onSave: vi.fn(), onDiscard };
  render(<CameraCapture {...props} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Capture' }));
  await userEvent.click(screen.getByRole('button', { name: 'Save photo' }));
  onDiscard.mockClear();
  await userEvent.click(screen.getByRole('button', { name: 'Retake' }));
  expect(onDiscard).toHaveBeenCalledOnce();
});

test('a new capture invalidates any previously accepted parent frame', async () => {
  installCameraMock();
  const onDiscard = vi.fn();
  render(<CameraCapture onSave={vi.fn()} onDiscard={onDiscard} />);

  await userEvent.click(await screen.findByRole('button', { name: 'Capture' }));

  expect(onDiscard).toHaveBeenCalledOnce();
});

test('a stale rear-camera rejection cannot stop the newer front stream', async () => {
  let rejectRear!: (error: unknown) => void;
  let resolveFront!: (stream: MediaStream) => void;
  const rear = new Promise<MediaStream>((_resolve, reject) => { rejectRear = reject; });
  const front = new Promise<MediaStream>(resolve => { resolveFront = resolve; });
  const frontStop = vi.fn();
  const getUserMedia = vi.fn().mockReturnValueOnce(rear).mockReturnValueOnce(front);
  installCameraMock(getUserMedia);
  render(<CameraCapture onSave={vi.fn()} />);
  await userEvent.click(screen.getByRole('button', { name: 'Switch to front camera' }));
  await act(async () => resolveFront(mediaStream(frontStop)));
  await waitFor(() => expect(screen.getByRole('button', { name: 'Capture' })).toBeEnabled());
  await act(async () => rejectRear(new DOMException('rear failed', 'NotReadableError')));
  expect(frontStop).not.toHaveBeenCalled();
  expect(screen.queryByText('The camera could not start. Close other camera apps and try again.')).not.toBeInTheDocument();
});

test('capture stays disabled until video metadata is ready', async () => {
  installCameraMock(undefined, 0);
  render(<CameraCapture onSave={vi.fn()} />);
  const capture = await screen.findByRole('button', { name: 'Capture' });
  expect(capture).toBeDisabled();
  const video = screen.getByLabelText('Live camera preview');
  Object.defineProperty(video, 'readyState', { value: 1, configurable: true });
  fireEvent.loadedMetadata(video);
  expect(capture).toBeEnabled();
});

test('draw failure shows recovery and stops every camera track', async () => {
  const stop = vi.fn();
  installCameraMock(vi.fn().mockResolvedValue(mediaStream(stop)));
  Object.defineProperty(HTMLCanvasElement.prototype, 'getContext', { value: vi.fn(() => ({ drawImage: () => { throw new Error('draw failed'); } })), configurable: true });
  render(<CameraCapture onSave={vi.fn()} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Capture' }));
  expect(await screen.findByText('This browser could not capture the camera frame.')).toBeVisible();
  expect(stop).toHaveBeenCalled();
});
