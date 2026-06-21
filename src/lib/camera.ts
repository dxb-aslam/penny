// Penny — promise bridge between the imperative captureImage() call and the
// React <CameraCapture> overlay (live in-app camera). One capture at a time.
import type { PickedImage } from './media';

type Resolver = (img: PickedImage | null) => void;

let resolver: Resolver | null = null;
let setOpenCb: ((v: boolean) => void) | null = null;

/** The overlay registers its open-setter on mount. Returns an unbinder. */
export function bindCameraHost(setOpen: (v: boolean) => void): () => void {
  setOpenCb = setOpen;
  return () => {
    if (setOpenCb === setOpen) setOpenCb = null;
  };
}

/** Open the in-app camera; resolves with the captured image or null (cancel / no host). */
export function openInAppCamera(): Promise<PickedImage | null> {
  if (!setOpenCb) return Promise.resolve(null);
  return new Promise((resolve) => {
    resolver = resolve;
    setOpenCb!(true);
  });
}

/** Called by the overlay when a shot is taken, cancelled, or a fallback runs. */
export function resolveCamera(img: PickedImage | null) {
  setOpenCb?.(false);
  const r = resolver;
  resolver = null;
  r?.(img);
}
