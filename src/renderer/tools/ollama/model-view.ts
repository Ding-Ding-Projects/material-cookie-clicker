import type {
  OllamaCatalogVariant,
  OllamaHardwareFitAssessment,
  OllamaRuntimeModel,
} from '../../../shared/ollama-suite-types.js';

export type CatalogSort = 'reference' | 'size-smallest' | 'size-largest' | 'fit';

const FIT_ORDER: Record<OllamaHardwareFitAssessment['verdict'], number> = {
  'Runs well': 0,
  'Runs with limits': 1,
  Unknown: 2,
  Unlikely: 3,
};

export function sortCatalogVariants(
  variants: readonly OllamaCatalogVariant[],
  sort: CatalogSort,
  fitByReference: Readonly<Record<string, OllamaHardwareFitAssessment>>,
): OllamaCatalogVariant[] {
  return [...variants].sort((left, right) => {
    if (sort === 'reference') return left.reference.localeCompare(right.reference);
    if (sort === 'size-smallest' || sort === 'size-largest') {
      const leftSize = left.sizeBytes ?? Number.POSITIVE_INFINITY;
      const rightSize = right.sizeBytes ?? Number.POSITIVE_INFINITY;
      const delta = leftSize - rightSize;
      return (sort === 'size-largest' ? -delta : delta) || left.reference.localeCompare(right.reference);
    }
    const leftFit = fitByReference[left.reference];
    const rightFit = fitByReference[right.reference];
    return (
      (leftFit ? FIT_ORDER[leftFit.verdict] : FIT_ORDER.Unknown) -
        (rightFit ? FIT_ORDER[rightFit.verdict] : FIT_ORDER.Unknown) ||
      left.reference.localeCompare(right.reference)
    );
  });
}

export function modelIsRunning(model: OllamaRuntimeModel, running: readonly OllamaRuntimeModel[]): boolean {
  return running.some((candidate) => candidate.reference === model.reference);
}

export function fitTone(assessment: OllamaHardwareFitAssessment | undefined): 'good' | 'warning' | 'bad' | 'unknown' {
  switch (assessment?.verdict) {
    case 'Runs well':
      return 'good';
    case 'Runs with limits':
      return 'warning';
    case 'Unlikely':
      return 'bad';
    default:
      return 'unknown';
  }
}
