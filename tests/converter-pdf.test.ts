import { describe, expect, it } from "vitest";
import {
  extractPdf,
  inspectPdf,
  mergePdfs,
  PdfOperationError,
  reorderPdf,
  rotatePdf,
  setPdfMetadata,
  splitPdf,
  validatePdfOutput,
} from "../src/shared/converter-pdf";

interface FixtureOptions {
  filteredStream?: boolean;
  objectStream?: boolean;
  encrypted?: boolean;
  title?: string;
  author?: string;
  pageTwoSentinel?: string;
}

function binaryBytes(value: string): Uint8Array {
  const bytes = new Uint8Array(value.length);
  for (let index = 0; index < value.length; index += 1) bytes[index] = value.charCodeAt(index) & 0xff;
  return bytes;
}

function encodeLiteral(value: string): string {
  return `(${value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)")})`;
}

function buildPdf(objects: ReadonlyMap<number, string>, rootId = 1, infoId?: number, trailerExtra = ""): Uint8Array {
  const ids = [...objects.keys()].sort((left, right) => left - right);
  const maxId = ids.at(-1) ?? 0;
  let output = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets = new Map<number, number>();
  for (const id of ids) {
    offsets.set(id, output.length);
    output += `${id} 0 obj\n${objects.get(id)}\nendobj\n`;
  }
  const xrefOffset = output.length;
  output += `xref\n0 ${maxId + 1}\n0000000000 65535 f \n`;
  for (let id = 1; id <= maxId; id += 1) {
    const offset = offsets.get(id);
    output += offset === undefined
      ? "0000000000 00000 f \n"
      : `${offset.toString().padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${maxId + 1} /Root ${rootId} 0 R`;
  if (infoId !== undefined) output += ` /Info ${infoId} 0 R`;
  if (trailerExtra) output += ` ${trailerExtra}`;
  output += ` >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return binaryBytes(output);
}

function minimalPdf(options: FixtureOptions = {}): Uint8Array {
  const emptyStream = options.filteredStream
    ? "<< /Filter /FlateDecode /Length 0 >>\nstream\n\nendstream"
    : "<< /Length 0 >>\nstream\n\nendstream";
  const info = options.objectStream
    ? "<< /Type /ObjStm /N 0 /First 0 /Length 0 >>\nstream\n\nendstream"
    : `<< /Title ${encodeLiteral(options.title ?? "Fixture One")} /Author ${encodeLiteral(options.author ?? "Test Author")} >>`;
  const pageTwoPayload = options.pageTwoSentinel ?? "";
  const objects = new Map<number, string>([
    [1, "<< /Type /Catalog /Pages 2 0 R >>"],
    [2, "<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>"],
    [3, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 4 0 R >>"],
    [4, emptyStream],
    [5, "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Resources << >> /Contents 6 0 R /Rotate 90 >>"],
    [6, `<< /Length ${pageTwoPayload.length} >>\nstream\n${pageTwoPayload}\nendstream`],
    [7, info],
  ]);
  return buildPdf(objects, 1, 7, options.encrypted ? "/Encrypt 7 0 R" : "");
}

function expectPdfError(action: () => unknown, code: PdfOperationError["code"]): PdfOperationError {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(PdfOperationError);
    expect((error as PdfOperationError).code).toBe(code);
    return error as PdfOperationError;
  }
  throw new Error(`Expected PdfOperationError with code ${code}.`);
}

describe("bounded PDF inspection", () => {
  it("inspects the supported classic-xref flat-page subset", () => {
    const inspection = inspectPdf(minimalPdf());

    expect(inspection.version).toBe("1.4");
    expect(inspection.pageCount).toBe(2);
    expect(inspection.pageObjectIds).toEqual([3, 5]);
    expect(inspection.rotations).toEqual([0, 90]);
    expect(inspection.metadata).toEqual({ title: "Fixture One", author: "Test Author" });
    expect(inspection.capabilities).toEqual({
      classicCrossReferenceTable: true,
      flatPageTree: true,
      unfilteredStreams: true,
      encrypted: false,
      incrementalUpdates: false,
      objectStreams: false,
      crossReferenceStreams: false,
      annotationsAndForms: false,
    });
  });

  it("rejects malformed signatures and bounded-size excess", () => {
    expectPdfError(() => inspectPdf(binaryBytes("not a pdf")), "invalid-pdf");
    expectPdfError(() => inspectPdf(minimalPdf(), { maxBytes: 32 }), "limit-exceeded");
    expectPdfError(() => inspectPdf(minimalPdf(), { maxObjects: 3 }), "limit-exceeded");
    expectPdfError(() => inspectPdf(minimalPdf(), { maxObjectBytes: 16 }), "limit-exceeded");
    expectPdfError(() => inspectPdf(minimalPdf(), { maxPages: 1 }), "limit-exceeded");
  });

  it("fails closed for encrypted, object-stream, filtered-stream, xref-stream, and incremental PDFs", () => {
    expectPdfError(() => inspectPdf(minimalPdf({ encrypted: true })), "unsupported-pdf");
    expectPdfError(() => inspectPdf(minimalPdf({ objectStream: true })), "unsupported-pdf");
    expectPdfError(() => inspectPdf(minimalPdf({ filteredStream: true })), "unsupported-pdf");

    const xrefStream = binaryBytes(
      "%PDF-1.5\n1 0 obj\n<< /Type /XRef /Length 0 >>\nstream\n\nendstream\nendobj\nstartxref\n9\n%%EOF\n",
    );
    expectPdfError(() => inspectPdf(xrefStream), "unsupported-pdf");

    const incremental = binaryBytes(`${String.fromCharCode(...minimalPdf())}startxref\n0\n%%EOF\n`);
    expectPdfError(() => inspectPdf(incremental), "unsupported-pdf");
  });
});

describe("bounded PDF page operations", () => {
  it("extracts a requested ordered page selection without mutating the source", () => {
    const source = minimalPdf({ pageTwoSentinel: "EXCLUDED-CONFIDENTIAL-PAGE" });
    const before = [...source];
    const output = extractPdf(source, [0]);

    const inspection = inspectPdf(output);
    expect(inspection.pageCount).toBe(1);
    expect(inspection.pageObjectIds).toEqual([3]);
    expect(inspection.rotations).toEqual([0]);
    expect(inspection.metadata.title).toBe("Fixture One");
    expect([...source]).toEqual(before);
    expect(String.fromCharCode(...output)).not.toContain("EXCLUDED-CONFIDENTIAL-PAGE");
  });

  it("splits every page by default and supports explicit groups", () => {
    const perPage = splitPdf(minimalPdf());
    expect(perPage).toHaveLength(2);
    expect(perPage.map((output) => inspectPdf(output).pageObjectIds)).toEqual([[3], [5]]);

    const grouped = splitPdf(minimalPdf(), [[1, 0]]);
    expect(grouped).toHaveLength(1);
    expect(inspectPdf(grouped[0]).pageObjectIds).toEqual([5, 3]);
    expectPdfError(
      () => splitPdf(minimalPdf(), undefined, { maxAggregateOutputBytes: 1 }),
      "limit-exceeded",
    );

    expectPdfError(() => splitPdf(minimalPdf(), [[0], [1]], { maxOutputs: 1 }), "limit-exceeded");
  });

  it("reorders every page exactly once", () => {
    const output = reorderPdf(minimalPdf(), [1, 0]);
    const inspection = inspectPdf(output);
    expect(inspection.pageObjectIds).toEqual([5, 3]);
    expect(inspection.rotations).toEqual([90, 0]);

    expectPdfError(() => reorderPdf(minimalPdf(), [0]), "invalid-operation");
    expectPdfError(() => reorderPdf(minimalPdf(), [0, 0]), "invalid-operation");
  });

  it("rotates selected pages by safe multiples of 90 degrees", () => {
    const output = rotatePdf(minimalPdf(), [
      { pageIndex: 0, degrees: 90 },
      { pageIndex: 1, degrees: -90 },
    ]);
    expect(inspectPdf(output).rotations).toEqual([90, 0]);

    expectPdfError(
      () => rotatePdf(minimalPdf(), [{ pageIndex: 0, degrees: 45 }]),
      "invalid-operation",
    );
    expectPdfError(
      () => rotatePdf(minimalPdf(), [
        { pageIndex: 0, degrees: 90 },
        { pageIndex: 0, degrees: 90 },
      ]),
      "invalid-operation",
    );
  });

  it("merges inputs in document and page order while preserving first-document metadata", () => {
    const output = mergePdfs([
      minimalPdf({ title: "First" }),
      minimalPdf({ title: "Second" }),
    ]);
    const inspection = inspectPdf(output);

    expect(inspection.pageCount).toBe(4);
    expect(inspection.rotations).toEqual([0, 90, 0, 90]);
    expect(inspection.metadata.title).toBe("First");
    expect(new Set(inspection.pageObjectIds).size).toBe(4);

    expectPdfError(() => mergePdfs([minimalPdf()]), "invalid-operation");
    expectPdfError(
      () => mergePdfs([minimalPdf(), minimalPdf()], { maxInputs: 1 }),
      "limit-exceeded",
    );
  });
});

describe("bounded PDF metadata and reopen validation", () => {
  it("sets, removes, and round-trips ASCII and Unicode metadata", () => {
    const output = setPdfMetadata(minimalPdf(), {
      title: "Tea menu 茶單",
      author: null,
      subject: "Bounded PDF operations",
    });
    expect(inspectPdf(output).metadata).toEqual({
      title: "Tea menu 茶單",
      subject: "Bounded PDF operations",
    });

    expectPdfError(
      () => setPdfMetadata(minimalPdf(), { title: "x".repeat(4097) }),
      "limit-exceeded",
    );
  });

  it("reopens generated bytes and refuses mismatched expected page, rotation, and metadata state", () => {
    const source = minimalPdf();
    expect(validatePdfOutput(source, {
      pageCount: 2,
      pageObjectIds: [3, 5],
      rotations: [0, 90],
      metadata: { title: "Fixture One" },
    }).pageCount).toBe(2);

    expectPdfError(() => validatePdfOutput(source, { pageCount: 3 }), "output-validation-failed");
    expectPdfError(() => validatePdfOutput(source, { rotations: [90, 90] }), "output-validation-failed");
    expectPdfError(
      () => validatePdfOutput(source, { metadata: { title: "Wrong" } }),
      "output-validation-failed",
    );
  });

  it("turns structural corruption into an output-validation failure before bytes are accepted", () => {
    const corrupt = minimalPdf();
    const marker = binaryBytes("3 0 obj");
    let markerIndex = -1;
    outer: for (let index = 0; index <= corrupt.length - marker.length; index += 1) {
      for (let inner = 0; inner < marker.length; inner += 1) {
        if (corrupt[index + inner] !== marker[inner]) continue outer;
      }
      markerIndex = index;
      break;
    }
    expect(markerIndex).toBeGreaterThan(0);
    corrupt[markerIndex] = "9".charCodeAt(0);

    expectPdfError(() => validatePdfOutput(corrupt), "output-validation-failed");
  });
});
