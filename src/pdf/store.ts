import * as crypto from "crypto";

const store = new Map<string, Buffer>();

export function generateGuidelinesId(): string {
  return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
}

export function storeGuidelinesPdf(buffer: Buffer): string {
  const id = generateGuidelinesId();
  store.set(id, buffer);
  return id;
}

export function getGuidelinesPdf(id: string): Buffer | undefined {
  return store.get(id);
}
