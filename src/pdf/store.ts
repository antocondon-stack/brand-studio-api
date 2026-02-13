import * as crypto from "crypto";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

const TMP_DIR = path.join(os.tmpdir(), "brand-studio-pdfs");
if (!fs.existsSync(TMP_DIR)) {
  fs.mkdirSync(TMP_DIR, { recursive: true });
}

const store = new Map<string, string>();

function generatePdfId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

function getFilePath(id: string): string {
  return path.join(TMP_DIR, `${id}.pdf`);
}

export function storePdf(buffer: Buffer, prefix: string = ""): string {
  const id = generatePdfId();
  const filePath = getFilePath(id);
  fs.writeFileSync(filePath, buffer);
  const key = prefix ? `${prefix}:${id}` : id;
  store.set(key, filePath);
  return id;
}

export function getPdf(id: string, prefix: string = ""): Buffer | undefined {
  const key = prefix ? `${prefix}:${id}` : id;
  const filePath = store.get(key);
  if (!filePath || !fs.existsSync(filePath)) return undefined;
  return fs.readFileSync(filePath);
}

export function storeGuidelinesPdf(buffer: Buffer): string {
  return storePdf(buffer, "guidelines");
}

export function getGuidelinesPdf(id: string): Buffer | undefined {
  return getPdf(id, "guidelines");
}

export function storeRoutesPdf(buffer: Buffer): string {
  return storePdf(buffer, "routes");
}

export function getRoutesPdf(id: string): Buffer | undefined {
  return getPdf(id, "routes");
}
