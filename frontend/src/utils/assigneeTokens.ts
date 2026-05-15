export function parseAssigneeTokens(raw: string | null | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function serializeAssigneeTokens(tokens: string[]): string {
  return tokens
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join(', ');
}

export function hasAssignee(rawAssignee: string | null | undefined, target: string): boolean {
  const t = target.trim();
  if (!t) return false;
  return parseAssigneeTokens(rawAssignee).includes(t);
}
