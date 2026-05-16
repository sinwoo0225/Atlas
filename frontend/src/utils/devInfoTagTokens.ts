export function parseTagTokens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function serializeTagTokens(tokens: string[]): string {
  return tokens
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(', ');
}
