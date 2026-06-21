// Penny — in-app live camera (getUserMedia). Shows a real-time preview, captures
// a frame, downscales it on-device before it ever leaves the phone, and hands back
// a compact JPEG. Falls back to the OS camera if the live preview can't start.
import { useCallback, useEffect, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { bindCameraHost, resolveCamera } from '../lib/camera';
import { deviceCamera } from '../lib/media';
import type { PickedImage } from '../lib/media';
import { Icons } from './Icons';

const MAX_EDGE = 1568; // Claude's sweet spot — smaller = faster + cheaper
const QUALITY = 0.72;

function frameToImage(video: HTMLVideoElement): PickedImage | null {
  const w = video.videoWidth, h = video.videoHeight;
  if (!w || !h) return null;
  const scale = Math.min(1, MAX_EDGE / Math.max(w, h));
  const cw = Math.round(w * scale), ch = Math.round(h * scale);
  const canvas = document.createElement('canvas');
  canvas.width = cw; canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(video, 0, 0, cw, ch);
  const dataUrl = canvas.toDataURL('image/jpeg', QUALITY);
  return { base64: dataUrl.split(',')[1] || '', mime: 'image/jpeg', dataUrl };
}

export function CameraCapture() {
  const [open, setOpen] = useState(false);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [error, setError] = useState<'denied' | 'error' | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  useEffect(() => bindCameraHost(setOpen), []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // (re)start the stream whenever the overlay opens or the camera is flipped
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setError(null);
      // On a device the WebView only streams if the app holds the CAMERA permission,
      // so request it first and surface a clear message if it's denied.
      if (Capacitor.isNativePlatform()) {
        try {
          const { Camera } = await import('@capacitor/camera');
          let perm = await Camera.checkPermissions();
          if (perm.camera !== 'granted' && perm.camera !== 'limited') {
            perm = await Camera.requestPermissions({ permissions: ['camera'] });
          }
          if (cancelled) return;
          if (perm.camera !== 'granted' && perm.camera !== 'limited') {
            setError('denied');
            return;
          }
        } catch { /* fall through to getUserMedia, which will surface its own error */ }
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
      } catch (e) {
        if (!cancelled) setError((e as DOMException)?.name === 'NotAllowedError' ? 'denied' : 'error');
      }
    })();
    return () => { cancelled = true; stop(); };
  }, [open, facing, stop]);

  const capture = () => {
    const v = videoRef.current;
    const img = v ? frameToImage(v) : null;
    stop();
    resolveCamera(img);
  };
  const cancel = () => { stop(); resolveCamera(null); };
  const flip = () => setFacing((f) => (f === 'environment' ? 'user' : 'environment'));
  const useDevice = async () => {
    stop();
    const img = await deviceCamera();
    resolveCamera(img);
  };
  const useLibrary = async () => {
    stop();
    const { pickFromLibrary } = await import('../lib/media');
    resolveCamera(await pickFromLibrary());
  };

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 150, background: '#0b0a08', display: 'flex', flexDirection: 'column' }}>
      {/* top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'calc(env(safe-area-inset-top, 0px) + 14px) 18px 10px' }}>
        <button onClick={cancel} aria-label="Close" style={{ border: 0, background: 'rgba(255,255,255,0.14)', color: '#fff', width: 38, height: 38, borderRadius: 19, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.close size={18} /></button>
        <span style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, fontWeight: 700 }}>Snap your receipt</span>
        <button onClick={flip} aria-label="Flip camera" style={{ border: 0, background: 'rgba(255,255,255,0.14)', color: '#fff', width: 38, height: 38, borderRadius: 19, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.loop size={18} /></button>
      </div>

      {/* preview */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {error ? (
          <div style={{ textAlign: 'center', color: '#fff', padding: 30 }}>
            <div style={{ fontSize: 14, opacity: 0.85, lineHeight: 1.6, marginBottom: 18 }}>
              {error === 'denied'
                ? <>Camera access is off. Allow the camera prompt, or enable it for Penny in your device Settings.<br />For now, use your device camera or photo library.</>
                : <>Couldn't start the in-app camera.<br />Use your device camera or photo library instead.</>}
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              <button className="chip-btn" style={{ background: '#fff', padding: '10px 16px' }} onClick={useDevice}>Device camera</button>
              <button className="chip-btn" style={{ background: 'rgba(255,255,255,0.16)', color: '#fff', borderColor: 'transparent', padding: '10px 16px' }} onClick={useLibrary}>Photo library</button>
            </div>
          </div>
        ) : (
          <video ref={videoRef} playsInline muted autoPlay style={{ width: '100%', height: '100%', objectFit: 'cover', transform: facing === 'user' ? 'scaleX(-1)' : 'none' }} />
        )}
      </div>

      {/* shutter */}
      {!error && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 30, padding: 'calc(env(safe-area-inset-bottom, 0px) + 22px) 0 30px' }}>
          <button onClick={useLibrary} aria-label="Photo library" style={{ border: 0, background: 'rgba(255,255,255,0.14)', color: '#fff', width: 46, height: 46, borderRadius: 23, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icons.filetext size={20} /></button>
          <button onClick={capture} aria-label="Capture" style={{ width: 74, height: 74, borderRadius: 37, background: '#fff', border: '4px solid rgba(255,255,255,0.45)', cursor: 'pointer', boxShadow: '0 0 0 3px rgba(0,0,0,0.25)' }} />
          <span style={{ width: 46 }} />
        </div>
      )}
    </div>
  );
}
