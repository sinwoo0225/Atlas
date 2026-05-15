import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { Search, X, AlertTriangle, CalendarDays, FileText, FolderOpen, GitBranch, Code2, NotebookPen } from 'lucide-react';
import { search, type SearchEntityType, type SearchHit } from '../api/search';
import { useGlobalShortcut } from '../hooks/useGlobalShortcut';

const DEBOUNCE_MS = 200;
const RESULT_LIMIT = 30;

// 엔티티 타입별 라벨/색/아이콘. 색은 index.css 의 토큰 변수와 어울리는 hex 직접 사용 —
// ProjectMap 5각형 팔레트와 톤을 맞춤.
const TYPE_META: Record<SearchEntityType, { label: string; Icon: typeof Search; color: string }> = {
  Project:     { label: '프로젝트',  Icon: FolderOpen,    color: '#9eb2ce' },
  WbsItem:     { label: 'WBS',       Icon: CalendarDays,  color: '#84cc16' },
  Issue:       { label: '이슈',      Icon: AlertTriangle, color: '#f87171' },
  Meeting:     { label: '회의록',    Icon: FileText,      color: '#a78bfa' },
  ChangeLog:   { label: '변경',      Icon: GitBranch,     color: '#fbbf24' },
  DevInfoItem: { label: '개발정보',  Icon: Code2,         color: '#34d399' },
  WorkLog:     { label: '업무일지',  Icon: NotebookPen,   color: '#60a5fa' },
};

function urlFor(hit: SearchHit): string {
  switch (hit.type) {
    case 'Project':     return `/projects/${hit.id}/dashboard`;
    case 'WbsItem':     return `/projects/${hit.projectId}/wbs?highlight=${hit.id}`;
    case 'Issue':       return `/projects/${hit.projectId}/issues?highlight=${hit.id}`;
    case 'Meeting':     return `/projects/${hit.projectId}/meetings?highlight=${hit.id}`;
    case 'ChangeLog':   return `/projects/${hit.projectId}/changelogs?highlight=${hit.id}`;
    case 'DevInfoItem': return `/projects/${hit.projectId}/devinfo?highlight=${hit.id}`;
    case 'WorkLog': {
      // 백엔드 WorkLog 색인 title 은 "yyyy-MM-dd 업무일지". highlight 의 <mark> 를 제거하고 날짜 추출.
      const plain = hit.title.replace(/<\/?mark>/g, '');
      const m = plain.match(/(\d{4}-\d{2}-\d{2})/);
      return m
        ? `/projects/${hit.projectId}/worklog?date=${m[1]}`
        : `/projects/${hit.projectId}/worklog`;
    }
  }
}

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useGlobalShortcut('mod+k', () => setOpen((v) => !v));

  useEffect(() => {
    if (!open) {
      setQuery('');
      setResults([]);
      setActiveIndex(0);
      return;
    }
    // 패널이 막 열렸으면 input 에 포커스. 그 다음 프레임에 — autoFocus 만으로는 portal mount 타이밍 이슈.
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q === '') {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const handle = window.setTimeout(async () => {
      try {
        const hits = await search({ q, limit: RESULT_LIMIT });
        setResults(hits);
        setActiveIndex(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(handle);
  }, [query, open]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = results[activeIndex];
      if (hit) {
        navigate(urlFor(hit));
        setOpen(false);
      }
    }
  };

  const groupedHint = useMemo(() => {
    if (results.length === 0) return null;
    const counts = new Map<SearchEntityType, number>();
    results.forEach((r) => counts.set(r.type, (counts.get(r.type) ?? 0) + 1));
    return Array.from(counts.entries())
      .map(([t, c]) => `${TYPE_META[t].label} ${c}`)
      .join(' · ');
  }, [results]);

  if (!open) return null;

  return createPortal(
    <div
      onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
      onKeyDown={onKeyDown}
      className="fixed inset-0 z-[60] flex items-start justify-center pt-[12vh] px-4"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
    >
      <div
        className="w-full max-w-2xl bg-surface border border-default rounded-lg shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: '70vh' }}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-default">
          <Search size={18} className="text-muted shrink-0" />
          <input
            ref={inputRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="프로젝트·WBS·이슈·회의록·변경·개발정보·업무일지 검색"
            className="flex-1 bg-transparent outline-none text-primary placeholder:text-muted text-sm"
          />
          {loading && <span className="text-xs text-muted shrink-0">검색 중…</span>}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-muted hover:text-primary p-1 rounded shrink-0"
            title="닫기 (Esc)"
          >
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {query.trim() === '' && (
            <div className="px-4 py-8 text-center text-sm text-muted">
              검색어를 입력하세요.
              <div className="mt-2 text-xs">↑↓ 이동 · Enter 선택 · Esc 닫기</div>
            </div>
          )}

          {query.trim() !== '' && !loading && results.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-muted">
              검색 결과가 없습니다.
            </div>
          )}

          {results.length > 0 && (
            <ul className="py-1">
              {results.map((hit, i) => {
                const meta = TYPE_META[hit.type];
                const Icon = meta.Icon;
                const active = i === activeIndex;
                return (
                  <li key={`${hit.type}-${hit.id}`}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => {
                        navigate(urlFor(hit));
                        setOpen(false);
                      }}
                      className={`w-full text-left px-4 py-2 flex items-start gap-3 transition-colors ${
                        active ? 'bg-surface-3' : 'hover:bg-surface-2'
                      }`}
                    >
                      <Icon size={16} className="mt-0.5 shrink-0" style={{ color: meta.color }} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-medium" style={{ color: meta.color }}>{meta.label}</span>
                          {hit.projectName && (
                            <>
                              <span className="text-muted">·</span>
                              <span className="text-muted truncate">{hit.projectName}</span>
                            </>
                          )}
                        </div>
                        <div
                          className="text-sm text-primary truncate cmd-hit"
                          dangerouslySetInnerHTML={{ __html: hit.title || '(제목 없음)' }}
                        />
                        {hit.snippet && (
                          <div
                            className="text-xs text-secondary mt-0.5 line-clamp-2 cmd-hit"
                            dangerouslySetInnerHTML={{ __html: hit.snippet }}
                          />
                        )}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {groupedHint && (
          <div className="px-4 py-2 border-t border-default text-[11px] text-muted flex justify-between">
            <span>{groupedHint}</span>
            <span>↑↓ 이동 · Enter 선택 · Esc 닫기</span>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
