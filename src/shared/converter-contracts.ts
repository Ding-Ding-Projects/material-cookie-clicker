import type { DetectionResult } from './converter-core.js';

export interface FileInspection {
  readonly absolutePath: string;
  readonly bytes: number;
  readonly detection: DetectionResult;
  readonly preview: string;
}

export interface ConvertFileRequest {
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly adapterId: string;
  readonly overwriteAuthorized?: boolean;
}

export interface ConvertFileOutcome {
  readonly sourcePath: string;
  readonly destinationPath: string;
  readonly inputBytes: number;
  readonly outputBytes: number;
  readonly detectedType: string;
  readonly targetType: string;
  readonly disclosure: string;
}
