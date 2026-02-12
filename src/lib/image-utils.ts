/**
 * Convert a File to base64 with magic bytes MIME detection.
 */
export async function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  const bytes = await file.arrayBuffer();
  const uint8 = new Uint8Array(bytes);

  // Detect MIME from magic bytes
  let mimeType = file.type || "image/png";
  if (uint8[0] === 0xFF && uint8[1] === 0xD8 && uint8[2] === 0xFF) {
    mimeType = "image/jpeg";
  } else if (uint8[0] === 0x89 && uint8[1] === 0x50 && uint8[2] === 0x4E && uint8[3] === 0x47) {
    mimeType = "image/png";
  } else if (uint8[0] === 0x47 && uint8[1] === 0x49 && uint8[2] === 0x46) {
    mimeType = "image/gif";
  } else if (uint8[0] === 0x52 && uint8[1] === 0x49 && uint8[2] === 0x46 && uint8[3] === 0x46 &&
             uint8[8] === 0x57 && uint8[9] === 0x45 && uint8[10] === 0x42 && uint8[11] === 0x50) {
    mimeType = "image/webp";
  }

  let binary = "";
  const chunkSize = 8192;
  for (let offset = 0; offset < uint8.length; offset += chunkSize) {
    binary += String.fromCharCode(...uint8.subarray(offset, offset + chunkSize));
  }
  const base64 = btoa(binary);
  return { base64, mimeType };
}

/**
 * Compress and resize an image file to max dimensions, returns base64.
 * Uses canvas for client-side resize. Max 1536px on longest side, JPEG quality 0.85.
 */
export async function compressImage(
  file: File,
  maxSize = 1536,
  quality = 0.85
): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      let { width, height } = img;

      // Only resize if larger than maxSize
      if (width > maxSize || height > maxSize) {
        if (width > height) {
          height = Math.round((height / width) * maxSize);
          width = maxSize;
        } else {
          width = Math.round((width / height) * maxSize);
          height = maxSize;
        }
      }

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0, width, height);

      // Convert to JPEG for compression (unless PNG with transparency needed)
      const mimeType = "image/jpeg";
      const dataUrl = canvas.toDataURL(mimeType, quality);
      const base64 = dataUrl.split(",")[1];

      resolve({ base64, mimeType });
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for compression"));
    };

    img.src = url;
  });
}
