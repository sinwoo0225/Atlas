export type AttendeeOrg = { org: string; members: string[] };
export type ActionItem = {
  id: string;
  content: string;
  assignee: string;
  deadline: string;
  promotedIssueId?: number;
  promotedWbsItemId?: number;
};

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

// 기존 데이터엔 id 가 없으므로 read 시 즉시 부여 (lazy migration).
// 다음 저장 시 부여된 id 가 JSON 에 영속됨. 인덱스 기반 식별은
// reorder/삭제 race 위험이 있어 백엔드 promote endpoint 는 id 로 매칭한다.
export function parseActionItems(raw: string): ActionItem[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((a) => typeof a === 'object' && 'content' in a)) {
      return (parsed as ActionItem[]).map((a) => ({
        ...a,
        id: a.id || crypto.randomUUID(),
      }));
    }
  } catch { /* legacy */ }
  return [];
}
