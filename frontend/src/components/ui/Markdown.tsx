import ReactMarkdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';

// 앱 전역 마크다운 렌더러. 기존의 맨몸 <ReactMarkdown> 을 이 한 컴포넌트로 통일해
// 모든 뷰어가 같은 플러그인·정책을 공유한다. 래퍼 div 는 각 호출부의 .markdown-body 를 유지.
//
// - remark-gfm      : 표·체크리스트·취소선·자동링크 (GFM)
// - remark-breaks   : 줄 한 번(Enter)을 <br> 로 (노트앱 스타일)
// - rehype-raw      : 본문에 직접 쓴 <br/> 등 raw HTML 허용
// - rehype-sanitize : raw HTML 을 GitHub 기본 스키마로 소독(<script>·이벤트·인라인 style 제거).
//                     순서 중요 — raw 로 파싱한 뒤 sanitize 로 정리한다.
//
// 참고: sanitize 기본 스키마가 표 태그, li.task-list-item, input[type=checkbox],
// code.className(language-*) 을 이미 허용하므로 커스텀 스키마가 필요 없다.
const REMARK_PLUGINS = [remarkGfm, remarkBreaks];
const REHYPE_PLUGINS = [rehypeRaw, rehypeSanitize];

const COMPONENTS: Components = {
  // 외부 링크는 새 창으로 — 데스크톱(WebView2) 호스트가 이를 가로채 시스템 브라우저로 연다.
  // 각주 등 앱 내부 앵커(#...)는 그대로 in-page 이동.
  a({ node: _node, href, children, ...rest }) {
    const external = !!href && !href.startsWith('#');
    return (
      <a
        href={href}
        {...rest}
        {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      >
        {children}
      </a>
    );
  },
};

export function Markdown({ children }: { children: string }) {
  return (
    <ReactMarkdown remarkPlugins={REMARK_PLUGINS} rehypePlugins={REHYPE_PLUGINS} components={COMPONENTS}>
      {children}
    </ReactMarkdown>
  );
}
