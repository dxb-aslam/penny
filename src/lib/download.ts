// Penny — save text to a file: browser download on web, write-to-storage on device.
import { Capacitor } from '@capacitor/core';

/** Returns a short status string describing where the file went. */
export async function downloadOrShare(filename: string, text: string, mime = 'text/csv'): Promise<string> {
  if (!Capacitor.isNativePlatform()) {
    try {
      const blob = new Blob([text], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return 'Downloaded ' + filename;
    } catch {
      return "Couldn't download";
    }
  }
  // Native: write to app-external storage (pullable via adb / a file manager).
  try {
    const { Filesystem, Directory, Encoding } = await import('@capacitor/filesystem');
    await Filesystem.writeFile({ path: filename, data: text, directory: Directory.External, encoding: Encoding.UTF8 });
    return 'Saved to app storage: ' + filename;
  } catch {
    return "Couldn't save file";
  }
}
