export type AttendeeOrg = { org: string; members: string[] };
export type ActionItem = { content: string; assignee: string; deadline: string };

export function parseAttendees(raw: string): AttendeeOrg[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((p) => typeof p === 'object' && 'org' in p && 'members' in p)) {
      return parsed as AttendeeOrg[];
    }
  } catch { /* legacy plain string */ }
  return [];
}

export function attendeesToDisplay(raw: string): string {
  const arr = parseAttendees(raw);
  if (arr.length > 0) {
    return arr.map((a) => `${a.org}: ${a.members.join(', ')}`).join(' | ');
  }
  return raw; // legacy
}

export function parseDecisions(raw: string): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((d) => typeof d === 'string')) return parsed;
  } catch { /* legacy */ }
  return raw.split('\n').filter(Boolean);
}

export function parseActionItems(raw: string): ActionItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((a) => typeof a === 'object' && 'content' in a)) {
      return parsed as ActionItem[];
    }
  } catch { /* legacy */ }
  return [];
}
