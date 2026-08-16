export type HardwareFitVerdict = "Runs well" | "Runs with limits" | "Unlikely" | "Unknown";

export interface HardwareEvidence {
  collectedAt: string;
  architecture: string | null;
  systemRamBytes: number | null;
  availableRamBytes: number | null;
  gpuModel: string | null;
  usableVramBytes: number | null;
  driverBackend: string | null;
  driverSupported: boolean | null;
  destinationFreeBytes: number | null;
}

export interface ModelFitEvidence {
  reference: string;
  blobSizeBytes: number | null;
  parameterCount: number | null;
  quantization: string | null;
  contextLength: number | null;
  contextBytesPerToken: number | null;
}

export interface HardwareFitAssessment {
  verdict: HardwareFitVerdict;
  assessedAt: string;
  reference: string;
  evidence: HardwareEvidence & ModelFitEvidence;
  assumptions: string[];
  reasons: string[];
  estimatedRamBytes: number | null;
  estimatedAdditionalDiskBytes: number | null;
}

const DOWNLOAD_HEADROOM = 1.15;
const MODEL_RUNTIME_HEADROOM = 1.2;
const MINIMUM_OS_HEADROOM_BYTES = 2 * 1024 ** 3;

function finitePositive(value: number | null): value is number {
  return value !== null && Number.isFinite(value) && value > 0;
}

export function assessHardwareFit(
  hardware: HardwareEvidence,
  model: ModelFitEvidence,
  now = new Date(),
): HardwareFitAssessment {
  const reasons: string[] = [];
  const assumptions = [
    `Download storage includes ${Math.round((DOWNLOAD_HEADROOM - 1) * 100)}% temporary-file headroom.`,
    `Runtime memory includes ${Math.round((MODEL_RUNTIME_HEADROOM - 1) * 100)}% model-load headroom.`,
    "The verdict is conservative evidence, not a guarantee that a model will run or perform well.",
  ];
  const contextBytes = finitePositive(model.contextLength) && finitePositive(model.contextBytesPerToken)
    ? model.contextLength * model.contextBytesPerToken
    : null;
  const estimatedRamBytes = finitePositive(model.blobSizeBytes) && contextBytes !== null
    ? Math.ceil(model.blobSizeBytes * MODEL_RUNTIME_HEADROOM + contextBytes + MINIMUM_OS_HEADROOM_BYTES)
    : null;
  const estimatedAdditionalDiskBytes = finitePositive(model.blobSizeBytes)
    ? Math.ceil(model.blobSizeBytes * DOWNLOAD_HEADROOM)
    : null;

  let verdict: HardwareFitVerdict = "Unknown";
  if (!finitePositive(model.blobSizeBytes)) reasons.push("The official/local metadata did not report an exact model blob size.");
  if (!finitePositive(model.contextLength) || !finitePositive(model.contextBytesPerToken)) {
    reasons.push("Context-window memory evidence is incomplete.");
  }
  if (!finitePositive(hardware.availableRamBytes)) reasons.push("Available system RAM was not measured.");
  if (!finitePositive(hardware.destinationFreeBytes)) reasons.push("Free destination storage was not measured.");

  if (estimatedAdditionalDiskBytes !== null && finitePositive(hardware.destinationFreeBytes)) {
    if (hardware.destinationFreeBytes < estimatedAdditionalDiskBytes) {
      verdict = "Unlikely";
      reasons.push("Free destination storage is below the conservative download requirement.");
    }
  }

  if (verdict !== "Unlikely" && estimatedRamBytes !== null && finitePositive(hardware.availableRamBytes)) {
    if (hardware.availableRamBytes < estimatedRamBytes) {
      verdict = "Unlikely";
      reasons.push("Available system RAM is below the conservative runtime estimate.");
    } else if (hardware.driverSupported === true && finitePositive(hardware.usableVramBytes)) {
      if (hardware.usableVramBytes >= estimatedRamBytes - MINIMUM_OS_HEADROOM_BYTES) {
        verdict = "Runs well";
        reasons.push("Usable VRAM and available RAM meet the conservative estimates.");
      } else {
        verdict = "Runs with limits";
        reasons.push("Available RAM meets the estimate, but usable VRAM does not; partial CPU/offload operation may be constrained.");
      }
    } else if (hardware.driverSupported === false) {
      verdict = "Runs with limits";
      reasons.push("Available RAM meets the estimate, but the detected GPU driver/backend is unsupported.");
    } else {
      verdict = "Runs with limits";
      reasons.push("Available RAM meets the estimate; GPU acceleration evidence is incomplete.");
    }
  }

  if (
    verdict !== "Unlikely" &&
    (estimatedRamBytes === null ||
      estimatedAdditionalDiskBytes === null ||
      !finitePositive(hardware.availableRamBytes) ||
      !finitePositive(hardware.destinationFreeBytes))
  ) {
    verdict = "Unknown";
  }

  if (reasons.length === 0) reasons.push("All required evidence was present for the conservative estimate.");
  return {
    verdict,
    assessedAt: now.toISOString(),
    reference: model.reference,
    evidence: { ...hardware, ...model },
    assumptions,
    reasons,
    estimatedRamBytes,
    estimatedAdditionalDiskBytes,
  };
}
