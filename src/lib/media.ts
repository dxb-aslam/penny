// Penny — cross-platform media capture: real camera + file picking.
// Native (iOS/Android) uses Capacitor plugins; the browser preview falls back to <input>.
import { Capacitor } from '@capacitor/core';
import { openInAppCamera } from './camera';

export interface PickedImage {
  base64: string; // raw base64 (no data: prefix)
  mime: string;
  dataUrl: string; // for inline preview
}

export interface PickedFile {
  base64: string;
  mime: string;
  name: string;
  size: number;
}

const isNative = Capacitor.isNativePlatform();

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(String(fr.result));
    fr.onerror = reject;
    fr.readAsDataURL(file);
  });
}

function stripPrefix(dataUrl: string): { base64: string; mime: string } {
  const m = dataUrl.match(/^data:([^;]+);base64,(.*)$/);
  if (m) return { mime: m[1], base64: m[2] };
  return { mime: 'application/octet-stream', base64: dataUrl };
}

function pickViaInput(accept: string, capture?: boolean): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    if (capture) input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    input.onchange = () => {
      resolve(input.files && input.files[0] ? input.files[0] : null);
      input.remove();
    };
    // If the dialog is dismissed there is no reliable event; the promise simply never resolves,
    // which is fine — the UI stays in its prior state.
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Capture or pick a receipt photo. 'camera' opens the in-app live-preview camera
 * (getUserMedia + on-device downscale); 'library' opens the OS photo picker.
 */
export async function captureImage(source: 'camera' | 'library' = 'camera'): Promise<PickedImage | null> {
  if (source === 'camera') return openInAppCamera();
  return pickFromLibrary();
}

/** OS photo library / file input — for the 'library' source and as a non-getUserMedia path. */
export async function pickFromLibrary(): Promise<PickedImage | null> {
  if (isNative) {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    try {
      const photo = await Camera.getPhoto({ quality: 70, resultType: CameraResultType.Base64, source: CameraSource.Photos, correctOrientation: true });
      if (!photo.base64String) return null;
      const mime = `image/${photo.format || 'jpeg'}`;
      return { base64: photo.base64String, mime, dataUrl: `data:${mime};base64,${photo.base64String}` };
    } catch {
      return null;
    }
  }
  const file = await pickViaInput('image/*');
  if (!file) return null;
  const dataUrl = await readFileAsDataUrl(file);
  const { base64, mime } = stripPrefix(dataUrl);
  return { base64, mime, dataUrl };
}

/** Fallback: open the OS camera app directly (used if the in-app camera can't start). */
export async function deviceCamera(): Promise<PickedImage | null> {
  if (isNative) {
    const { Camera, CameraResultType, CameraSource } = await import('@capacitor/camera');
    try {
      const photo = await Camera.getPhoto({ quality: 70, resultType: CameraResultType.Base64, source: CameraSource.Camera, correctOrientation: true });
      if (!photo.base64String) return null;
      const mime = `image/${photo.format || 'jpeg'}`;
      return { base64: photo.base64String, mime, dataUrl: `data:${mime};base64,${photo.base64String}` };
    } catch {
      return null;
    }
  }
  const file = await pickViaInput('image/*', true);
  if (!file) return null;
  const dataUrl = await readFileAsDataUrl(file);
  const { base64, mime } = stripPrefix(dataUrl);
  return { base64, mime, dataUrl };
}

/** Pick a statement file (PDF / image). */
export async function pickFile(): Promise<PickedFile | null> {
  if (isNative) {
    const { FilePicker } = await import('@capawesome/capacitor-file-picker');
    try {
      const res = await FilePicker.pickFiles({ types: ['application/pdf', 'image/*'], readData: true });
      const f = res.files && res.files[0];
      if (!f || !f.data) return null;
      return {
        base64: f.data,
        mime: f.mimeType || 'application/pdf',
        name: f.name || 'statement.pdf',
        size: f.size || 0,
      };
    } catch {
      return null;
    }
  }
  const file = await pickViaInput('application/pdf,image/*');
  if (!file) return null;
  const dataUrl = await readFileAsDataUrl(file);
  const { base64, mime } = stripPrefix(dataUrl);
  return { base64, mime, name: file.name, size: file.size };
}

export { isNative };
