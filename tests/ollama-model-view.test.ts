import { describe, expect, it } from 'vitest';

import type { OllamaCatalogVariant, OllamaHardwareFitAssessment } from '../src/shared/ollama-suite-types.js';
import { fitTone, sortCatalogVariants } from '../src/renderer/tools/ollama/model-view.js';

function variant(reference: string, sizeBytes: number | null): OllamaCatalogVariant {
  const [model, tag = 'latest'] = reference.split(':');
  return {
    model: model ?? reference,
    tag,
    reference,
    displayLabel: reference,
    sizeBytes,
    parameterSize: null,
    quantization: null,
    capabilities: [],
    officialUrl: `https://ollama.com/library/${model}`,
  };
}

function assessment(reference: string, verdict: OllamaHardwareFitAssessment['verdict']): OllamaHardwareFitAssessment {
  return {
    verdict,
    assessedAt: '2026-08-19T00:00:00.000Z',
    reference,
    evidence: {
      collectedAt: '2026-08-19T00:00:00.000Z', architecture: 'x64', systemRamBytes: 1, availableRamBytes: 1,
      gpuModel: null, usableVramBytes: null, driverBackend: null, driverSupported: null, destinationFreeBytes: 1,
      blobSizeBytes: 1, parameterCount: 1, quantization: 'Q4', contextLength: 1, contextBytesPerToken: 1,
    },
    assumptions: [], reasons: [], estimatedRamBytes: 1, estimatedAdditionalDiskBytes: 1,
  };
}

describe('Ollama catalog presentation', () => {
  const variants = [variant('zeta:latest', 5), variant('alpha:q4', null), variant('beta:q8', 20)];

  it('sorts by name and size without mutating the controller snapshot', () => {
    expect(sortCatalogVariants(variants, 'reference', {}).map((item) => item.reference)).toEqual(['alpha:q4', 'beta:q8', 'zeta:latest']);
    expect(sortCatalogVariants(variants, 'size-smallest', {}).map((item) => item.reference)).toEqual(['zeta:latest', 'beta:q8', 'alpha:q4']);
    expect(sortCatalogVariants(variants, 'size-largest', {}).map((item) => item.reference)).toEqual(['alpha:q4', 'beta:q8', 'zeta:latest']);
    expect(variants.map((item) => item.reference)).toEqual(['zeta:latest', 'alpha:q4', 'beta:q8']);
  });

  it('sorts evidence-backed fit verdicts conservatively', () => {
    const fit = {
      'zeta:latest': assessment('zeta:latest', 'Unlikely'),
      'alpha:q4': assessment('alpha:q4', 'Runs well'),
      'beta:q8': assessment('beta:q8', 'Runs with limits'),
    };
    expect(sortCatalogVariants(variants, 'fit', fit).map((item) => item.reference)).toEqual(['alpha:q4', 'beta:q8', 'zeta:latest']);
    expect(fitTone(fit['alpha:q4'])).toBe('good');
    expect(fitTone(fit['beta:q8'])).toBe('warning');
    expect(fitTone(fit['zeta:latest'])).toBe('bad');
    expect(fitTone(undefined)).toBe('unknown');
  });
});
