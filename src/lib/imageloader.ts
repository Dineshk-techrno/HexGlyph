export type SupportedFormat = "svg" | "png" | "jpg" | "unknown";

export function detectFormat(file: File): SupportedFormat {
  const name = file.name.toLowerCase();
  const type = file.type.toLowerCase();
  if (type === "image/svg+xml" || name.endsWith(".svg")) return "svg";
  if (type === "image/png" || name.endsWith(".png")) return "png";
  if (type === "image/jpeg" || name.endsWith(".jpg") || name.endsWith(".jpeg")) return "jpg";
  return "unknown";
}

// Minimum canvas size for reliable pixel sampling.
// The hex grid SVG at GRID_RADIUS=28 is ~1840px. Rendering smaller than
// this causes cells to be too few pixels wide for accurate brightness sampling.
const MIN_RENDER_SIZE = 1024;

export function fileToImageData(file: File): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth || img.width;
      const h = img.naturalHeight || img.height;
      if (!w || !h) {
        URL.revokeObjectURL(url);
        reject(new Error("Image has zero dimensions — the file may be corrupt or unsupported"));
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error("Could not get canvas context")); return; }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);

      // Guard: all-zero pixel data means the canvas is blank (e.g. cross-origin blocked)
      if (imageData.data.every(v => v === 0)) {
        reject(new Error("Image appears blank — the file may be empty or its format is not supported by this browser"));
        return;
      }

      resolve(imageData);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image — the file may be corrupt or in an unsupported format")); };
    img.src = url;
  });
}

export function svgStringToImageData(svgString: string): Promise<ImageData> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      // naturalWidth/naturalHeight are preferred — Android WebView sometimes
      // returns 0 for SVG width/height attributes but populates naturalWidth.
      // Fall back to MIN_RENDER_SIZE to ensure sufficient resolution for sampling.
      const w = img.naturalWidth || img.width || 0;
      const h = img.naturalHeight || img.height || 0;
      const size = Math.max(w, h, MIN_RENDER_SIZE);
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error("Could not get canvas context")); return; }
      ctx.drawImage(img, 0, 0, size, size);
      const imageData = ctx.getImageData(0, 0, size, size);
      URL.revokeObjectURL(url);

      if (imageData.data.every(v => v === 0)) {
        reject(new Error(
          "SVG rendered as blank — your browser may not support SVG pixel decoding via canvas. " +
          "Try downloading the glyph as PNG and uploading that instead."
        ));
        return;
      }

      resolve(imageData);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to render SVG — the file may be corrupt")); };
    img.src = url;
  });
}

export function videoFrameToImageData(video: HTMLVideoElement): ImageData {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error("Camera frame not ready — wait for video to load and try again.");
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not get canvas context");
  ctx.drawImage(video, 0, 0);
  const imageData = ctx.getImageData(0, 0, w, h);
  if (imageData.data.every(v => v === 0)) {
    throw new Error("Camera frame is blank — ensure camera permissions are granted and the lens is not covered");
  }
  return imageData;
}

export async function loadImageFromFile(file: File): Promise<ImageData> {
  const fmt = detectFormat(file);
  if (fmt === "svg") {
    const text = await file.text();
    return svgStringToImageData(text);
  }
  return fileToImageData(file);
}

export function isAcceptedFormat(file: File): boolean {
  const fmt = detectFormat(file);
  return fmt === "svg" || fmt === "png" || fmt === "jpg";
}
