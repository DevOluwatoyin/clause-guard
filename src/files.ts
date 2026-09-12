import { OfficeParser } from "officeparser";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set(["txt", "pdf", "docx", "pptx", "ppt"]);
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "webp"]);

export type UploadedDocument = { filename: string; text?: string; imageDataUrl?: string };

function extension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() ?? "";
}

export function isSupportedFile(filename: string): boolean {
  const ext = extension(filename);
  return TEXT_EXTENSIONS.has(ext) || IMAGE_EXTENSIONS.has(ext);
}

export async function extractUploadedDocument(buffer: Buffer, filename: string): Promise<UploadedDocument> {
  if (buffer.length > MAX_FILE_BYTES) {
    throw new Error("FILE_TOO_LARGE");
  }
  const ext = extension(filename);
  if (IMAGE_EXTENSIONS.has(ext)) {
    const mime = ext === "jpg" ? "image/jpeg" : `image/${ext}`;
    return { filename, imageDataUrl: `data:${mime};base64,${buffer.toString("base64")}` };
  }
  if (ext === "ppt") {
    throw new Error("LEGACY_PPT");
  }
  if (!TEXT_EXTENSIONS.has(ext)) {
    throw new Error("UNSUPPORTED_FILE");
  }
  if (ext === "txt") {
    const text = buffer.toString("utf8").trim();
    if (!text) throw new Error("NO_EXTRACTABLE_TEXT");
    return { filename, text };
  }
  const ast = await OfficeParser.parseOffice(buffer, {
    fileType: ext as "pdf" | "docx" | "pptx",
    ocr: ext === "pdf",
    ocrConfig: { timeout: { workerLoad: 30_000, recognition: 15_000 } }
  });
  const result = await ast.to("text", { includeImages: false, textConfig: { preserveLayout: false, renderNotes: false } });
  const text = String(result.value).trim();
  if (!text) throw new Error("NO_EXTRACTABLE_TEXT");
  return { filename, text };
}

export function fileHelpText(): string {
  return "Supported uploads: TXT, DOCX, PDF, PPTX, PNG, JPG, JPEG, and WEBP (10 MB maximum). Convert legacy .ppt files to .pptx first.";
}
