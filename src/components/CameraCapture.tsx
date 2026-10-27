import { useCallback, useEffect, useRef, useState } from 'react';

type Facing = 'environment' | 'user';

export function CameraCapture({ onSave, onDiscard, busy = false }: { onSave(file: File): void | Promise<void>; onDiscard?(): void; busy?: boolean }) {
  const [facing, setFacing] = useState<Facing>('environment');
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [frame, setFrame] = useState<File | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const requestRef = useRef(0);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setStream(null);
    setReady(false);
  }, []);

  const startCamera = useCallback(async (nextFacing: Facing) => {
    const request = ++requestRef.current;
    stopCamera();
    setError(null);
    if (window.isSecureContext === false) { setError('Live camera capture needs a secure connection.'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setError('This browser does not support live camera capture.'); return; }
    try {
      const next = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: nextFacing } } });
      if (request !== requestRef.current) { next.getTracks().forEach(track => track.stop()); return; }
      streamRef.current = next;
      setStream(next);
    } catch (caught) {
      if (request !== requestRef.current) return;
      stopCamera();
      const name = caught instanceof DOMException ? caught.name : '';
      setError(name === 'NotAllowedError' || name === 'SecurityError'
        ? 'Camera permission was denied. Allow camera access and try again.'
        : name === 'NotFoundError' || name === 'DevicesNotFoundError'
          ? 'No camera was found on this device.'
          : 'The camera could not start. Close other camera apps and try again.');
    }
  }, [stopCamera]);

  useEffect(() => {
    void startCamera(facing);
    return () => { requestRef.current += 1; stopCamera(); };
  }, [facing, startCamera, stopCamera]);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream;
      setReady(!!stream && videoRef.current.readyState >= HTMLMediaElement.HAVE_METADATA);
    }
  }, [stream]);

  async function capture() {
    try {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!ready || !video || video.readyState < HTMLMediaElement.HAVE_METADATA || !canvas || !context) throw new Error('Camera frame unavailable');
      onDiscard?.();
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.9));
      if (!blob) throw new Error('Camera frame unavailable');
      setFrame(new File([blob], `tidemark-camera-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      setSaved(false);
    } catch {
      stopCamera();
      setError('This browser could not capture the camera frame.');
    }
  }

  async function save() {
    if (!frame) return;
    stopCamera();
    setSaving(true);
    setError(null);
    try { await onSave(frame); setSaved(true); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'The photo could not be saved.'); }
    finally { setSaving(false); }
  }

  function retake() {
    onDiscard?.();
    setFrame(null);
    setSaved(false);
    setError(null);
    if (!streamRef.current) void startCamera(facing);
  }

  return <div className="camera-capture">
    {error ? <div className="camera-recovery"><p className="form-error">{error}</p><button className="text-button" type="button" onClick={() => void startCamera(facing)}>Try camera again</button></div> : <>
      <video ref={videoRef} className={frame ? 'camera-hidden' : ''} aria-label="Live camera preview" autoPlay muted playsInline onLoadedMetadata={event => setReady(event.currentTarget.readyState >= HTMLMediaElement.HAVE_METADATA)} />
      <canvas ref={canvasRef} className={frame ? '' : 'camera-hidden'} aria-label="Captured photo" />
      {frame && <p className="camera-ready">{saved ? 'Photo saved' : 'Photo ready'}</p>}
      <div className="camera-actions">
        {frame ? <><button className="text-button" type="button" onClick={retake}>Retake</button><button className="primary-button" type="button" disabled={saved || saving || busy} onClick={() => void save()}>{saving || busy ? 'Saving photo…' : saved ? 'Photo saved' : 'Save photo'}</button></> : <><button className="text-button" type="button" onClick={() => setFacing(value => value === 'environment' ? 'user' : 'environment')}>Switch to {facing === 'environment' ? 'front' : 'rear'} camera</button><button className="primary-button" type="button" disabled={!stream || !ready} onClick={() => void capture()}>Capture</button></>}
      </div>
    </>}
  </div>;
}
