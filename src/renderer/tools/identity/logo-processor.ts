import { inspectLogoBytes } from "../../../shared/identity-image";
import { LOGO_DERIVATIVE_SIZES, validateLogoTransform, type IdentityValidation, type LogoDerivative, type LogoMetadata, type LogoTransform } from "../../../shared/identity-model";

export interface ProcessedLogo { sourceDataUrl: string; metadata: LogoMetadata; derivatives: LogoDerivative[] }

function dataUrl(bytes: Uint8Array, mimeType: string): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:${mimeType};base64,${btoa(binary)}`;
}

export async function processLogoFile(file: File, transform: LogoTransform): Promise<IdentityValidation<ProcessedLogo>> {
  const transformVerdict = validateLogoTransform(transform);
  if (!transformVerdict.ok) return transformVerdict;
  const bytes = new Uint8Array(await file.arrayBuffer());
  const inspected = inspectLogoBytes(bytes);
  if (!inspected.ok) return inspected;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(new Blob([bytes], { type: inspected.value.mimeType }));
  } catch {
    return { ok: false, reason: "The image decoder rejected this file." };
  }
  if (bitmap.width !== inspected.value.width || bitmap.height !== inspected.value.height) {
    bitmap.close();
    return { ok: false, reason: "Decoded dimensions did not match the validated image header." };
  }
  const derivatives: LogoDerivative[] = [];
  try {
    const sx = Math.round(transform.cropX * bitmap.width);
    const sy = Math.round(transform.cropY * bitmap.height);
    const sw = Math.max(1, Math.round(transform.cropWidth * bitmap.width));
    const sh = Math.max(1, Math.round(transform.cropHeight * bitmap.height));
    for (const size of LOGO_DERIVATIVE_SIZES) {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d", { alpha: true });
      if (!context) return { ok: false, reason: "A local canvas decoder was not available." };
      context.clearRect(0, 0, size, size);
      if (transform.background !== "transparent") { context.fillStyle = transform.background; context.fillRect(0, 0, size, size); }
      let dw = size, dh = size;
      if (transform.fit !== "fill") {
        const ratio = transform.fit === "contain" ? Math.min(size / sw, size / sh) : Math.max(size / sw, size / sh);
        dw = sw * ratio; dh = sh * ratio;
      }
      const dx = (size - dw) * transform.focalX;
      const dy = (size - dh) * transform.focalY;
      context.drawImage(bitmap, sx, sy, sw, sh, dx, dy, dw, dh);
      derivatives.push({ size, mimeType: "image/png", dataUrl: canvas.toDataURL("image/png") });
    }
  } finally {
    bitmap.close();
  }
  return { ok: true, value: { sourceDataUrl: dataUrl(bytes, inspected.value.mimeType), metadata: inspected.value, derivatives } };
}
