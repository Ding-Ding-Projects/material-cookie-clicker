import { inspectLogoBytes } from "../shared/identity-image.js";
import type { IdentityValidation, LogoMetadata } from "../shared/identity-model.js";

export interface IdentityImageService {
  inspect(bytes: Uint8Array): IdentityValidation<LogoMetadata>;
}

/** Main-process seam: byte inspection is deterministic, local-only and has no filesystem or network side effects. */
export const identityImageService: IdentityImageService = {
  inspect: inspectLogoBytes,
};
