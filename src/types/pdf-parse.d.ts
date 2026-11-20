/**
 * Type declaration for pdf-parse@1.
 *
 * We import `pdf-parse/lib/pdf-parse.js` directly (instead of the package
 * root) to bypass a debug harness in pdf-parse@1's index.js that executes a
 * bundled test PDF when the package is required as the main module.
 * The package ships no usable types, so declare the minimal surface we use.
 */
declare module 'pdf-parse/lib/pdf-parse.js' {
  interface PdfParseResult {
    /** Extracted plain text of the whole document. */
    text: string;
    numpages: number;
    numrender: number;
    info: Record<string, unknown>;
    metadata: unknown;
    version: string;
  }

  function pdfParse(buffer: Buffer | Uint8Array, options?: Record<string, unknown>): Promise<PdfParseResult>;

  export default pdfParse;
}
