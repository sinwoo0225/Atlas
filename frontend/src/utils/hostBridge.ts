// WebView2 호스트(WPF) 와의 메시지 브릿지.
// 프론트는 window.chrome.webview.postMessage 로 요청을 보내고,
// 호스트가 PostWebMessageAsJson 으로 응답하면 message 이벤트로 받는다.

interface ChromeWebView {
  postMessage: (msg: unknown) => void;
  addEventListener: (event: 'message', handler: (e: MessageEvent) => void) => void;
  removeEventListener: (event: 'message', handler: (e: MessageEvent) => void) => void;
}

declare global {
  interface Window {
    chrome?: { webview?: ChromeWebView };
  }
}

export function isHostBridgeAvailable(): boolean {
  return typeof window !== 'undefined' && !!window.chrome?.webview;
}

let counter = 0;

interface PickResult {
  type?: string;
  requestId?: string;
  path?: string | null;
}

// WPF 호스트에 네이티브 폴더 선택 다이얼로그를 요청한다.
// 호스트 브릿지가 없는 환경(브라우저 dev 등)에서는 null 을 즉시 resolve.
export function pickFolder(initialPath?: string): Promise<string | null> {
  return new Promise((resolve) => {
    const bridge = window.chrome?.webview;
    if (!bridge) {
      resolve(null);
      return;
    }

    const requestId = `pickFolder-${++counter}-${Date.now()}`;

    const onMessage = (e: MessageEvent) => {
      const data = e.data as PickResult | null | undefined;
      if (!data || typeof data !== 'object') return;
      if (data.type !== 'pickFolderResult' || data.requestId !== requestId) return;
      bridge.removeEventListener('message', onMessage);
      resolve(data.path ?? null);
    };
    bridge.addEventListener('message', onMessage);

    bridge.postMessage({ type: 'pickFolder', requestId, initialPath });
  });
}

export function pickFile(opts?: { initialDir?: string; title?: string }): Promise<string | null> {
  return new Promise((resolve) => {
    const bridge = window.chrome?.webview;
    if (!bridge) {
      resolve(null);
      return;
    }

    const requestId = `pickFile-${++counter}-${Date.now()}`;

    const onMessage = (e: MessageEvent) => {
      const data = e.data as PickResult | null | undefined;
      if (!data || typeof data !== 'object') return;
      if (data.type !== 'pickFileResult' || data.requestId !== requestId) return;
      bridge.removeEventListener('message', onMessage);
      resolve(data.path ?? null);
    };
    bridge.addEventListener('message', onMessage);

    bridge.postMessage({
      type: 'pickFile',
      requestId,
      initialDir: opts?.initialDir,
      title: opts?.title,
    });
  });
}

// 연결 설정(BootstrapConfig) 은 항상 클라이언트 머신 로컬이라 API 가 아닌 호스트 브릿지로 접근.
// Client 모드에서는 일반 /api 호출이 원격 서버로 라우팅되어 서버측 config 를 만지게 되기 때문.

export type ConnectionMode = 'Local' | 'Client';

export interface ConnectionConfig {
  mode: ConnectionMode;
  serverUrl: string | null;
  apiKey: string | null;
}

interface ConnectionResult {
  type?: string;
  requestId?: string;
  mode?: string;
  serverUrl?: string | null;
  apiKey?: string | null;
  saved?: boolean;
  requiresRestart?: boolean;
}

export function getConnectionConfig(): Promise<ConnectionConfig | null> {
  return new Promise((resolve) => {
    const bridge = window.chrome?.webview;
    if (!bridge) {
      resolve(null);
      return;
    }

    const requestId = `getConn-${++counter}-${Date.now()}`;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as ConnectionResult | null | undefined;
      if (!data || typeof data !== 'object') return;
      if (data.type !== 'getConnectionConfigResult' || data.requestId !== requestId) return;
      bridge.removeEventListener('message', onMessage);
      resolve({
        mode: (data.mode === 'Client' ? 'Client' : 'Local') as ConnectionMode,
        serverUrl: data.serverUrl ?? null,
        apiKey: data.apiKey ?? null,
      });
    };
    bridge.addEventListener('message', onMessage);
    bridge.postMessage({ type: 'getConnectionConfig', requestId });
  });
}

export function setConnectionConfig(cfg: ConnectionConfig): Promise<{ saved: boolean; requiresRestart: boolean } | null> {
  return new Promise((resolve) => {
    const bridge = window.chrome?.webview;
    if (!bridge) {
      resolve(null);
      return;
    }

    const requestId = `setConn-${++counter}-${Date.now()}`;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as ConnectionResult | null | undefined;
      if (!data || typeof data !== 'object') return;
      if (data.type !== 'setConnectionConfigResult' || data.requestId !== requestId) return;
      bridge.removeEventListener('message', onMessage);
      resolve({ saved: !!data.saved, requiresRestart: !!data.requiresRestart });
    };
    bridge.addEventListener('message', onMessage);
    bridge.postMessage({
      type: 'setConnectionConfig',
      requestId,
      mode: cfg.mode,
      serverUrl: cfg.serverUrl,
      apiKey: cfg.apiKey,
    });
  });
}

export interface TestConnectionResult {
  ok: boolean;
  status: number;
  error: string | null;
}

interface TestResultMsg {
  type?: string;
  requestId?: string;
  ok?: boolean;
  status?: number;
  error?: string | null;
}

// 첫 부팅 시 Settings.defaultAuthor 가 비어 있으면 클라 머신 사용자명으로 한 번 시드한다.
// Client 모드에서도 서버가 아닌 *클라이언트* 머신의 계정을 반환 — actor 구분의 기본값.
// 브릿지가 없는 dev 모드에서는 null 즉시 resolve (사용자가 SettingsPage 에서 직접 입력).
interface MachineAccountResult {
  type?: string;
  requestId?: string;
  userName?: string | null;
}

export function getMachineAccount(): Promise<string | null> {
  return new Promise((resolve) => {
    const bridge = window.chrome?.webview;
    if (!bridge) {
      resolve(null);
      return;
    }

    const requestId = `getMachine-${++counter}-${Date.now()}`;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as MachineAccountResult | null | undefined;
      if (!data || typeof data !== 'object') return;
      if (data.type !== 'getMachineAccountResult' || data.requestId !== requestId) return;
      bridge.removeEventListener('message', onMessage);
      const name = data.userName?.trim();
      resolve(name ? name : null);
    };
    bridge.addEventListener('message', onMessage);
    bridge.postMessage({ type: 'getMachineAccount', requestId });
  });
}

// Windows 음성 입력(받아쓰기) 토글 = Win+H. 웹은 OS 전역 단축키를 못 보내므로 호스트에 위임.
// 데스크톱앱(브릿지)에서만 동작 — 브라우저 dev 에서는 no-op (버튼도 숨김).
export function launchDictation(): void {
  const bridge = window.chrome?.webview;
  if (!bridge) return;
  bridge.postMessage({ type: 'launchDictation', requestId: `dictation-${++counter}-${Date.now()}` });
}

// 데스크톱 앱의 커스텀 제목 표시줄 워드마크 + OS 창 제목(작업표시줄·Alt+Tab)을 갱신한다.
// 제목 표시줄은 네이티브 XAML 이라 document.title 로는 안 바뀌므로 호스트에 위임.
// 브라우저 dev 에서는 no-op (탭 제목은 document.title 가 담당).
export interface HostBrand {
  primaryText: string;
  accentText: string;
  primaryColor: string;
  accentColor: string;
  title: string;
  // 작업표시줄/창 아이콘 data URL. 빈 문자열이면 호스트가 기본 atlas.ico 로 복귀.
  iconDataUrl: string;
}

export function setHostBrand(brand: HostBrand): void {
  const bridge = window.chrome?.webview;
  if (!bridge) return;
  bridge.postMessage({ type: 'setBrand', ...brand });
}

// 데스크톱 앱의 커스텀 제목 표시줄·창·캡션 버튼 색을 인앱 테마(라이트/다크/커스텀)에 맞춘다.
// 제목 표시줄은 WebView2 바깥 네이티브 XAML 이라 웹 CSS 로는 안 바뀌므로 호스트에 위임.
// 브라우저 dev 에서는 no-op.
export interface HostTheme {
  bg: string;        // 제목 표시줄·창 배경
  fg: string;        // 캡션 글리프(평상시)
  fgStrong: string;  // 캡션 글리프(호버)
  hoverBg: string;   // 최소/최대 버튼 호버 배경
  border: string;    // 제목 표시줄 하단 경계
}

export function setHostTheme(theme: HostTheme): void {
  const bridge = window.chrome?.webview;
  if (!bridge) return;
  bridge.postMessage({ type: 'setTheme', ...theme });
}

// ===== 위젯 모드 (데스크톱 보조 always-on-top 창) =====
// 모두 fire-and-forget — 응답이 필요 없는 네이티브 창 제어. 브릿지 없으면 no-op.

// 메인 앱 → 위젯 창 표시/숨김 토글 (사이드바 버튼).
export function toggleWidget(): void {
  const bridge = window.chrome?.webview;
  if (!bridge) return;
  bridge.postMessage({ type: 'toggleWidget' });
}

// 위젯 창 → 자신의 불투명도 변경 (0.4~1.0). 호스트가 즉시 적용 + config 저장.
export function setWidgetOpacity(opacity: number): void {
  const bridge = window.chrome?.webview;
  if (!bridge) return;
  bridge.postMessage({ type: 'setWidgetOpacity', opacity });
}

// 위젯 창 → 항상 위(Topmost) 고정 토글.
export function setWidgetPinned(pinned: boolean): void {
  const bridge = window.chrome?.webview;
  if (!bridge) return;
  bridge.postMessage({ type: 'setWidgetPinned', pinned });
}

// 위젯 창 → 자기 자신 닫기(숨김). 다시 토글하면 재표시.
export function closeWidget(): void {
  const bridge = window.chrome?.webview;
  if (!bridge) return;
  bridge.postMessage({ type: 'hideWidget' });
}

// 위젯 타이틀바 mousedown → 네이티브 창 드래그 시작(WM_NCLBUTTONDOWN).
export function beginWidgetDrag(): void {
  const bridge = window.chrome?.webview;
  if (!bridge) return;
  bridge.postMessage({ type: 'beginWidgetDrag' });
}

// 우하단 그립 mousedown → 네이티브 창 리사이즈 시작(WM_NCLBUTTONDOWN/HTBOTTOMRIGHT).
export function beginWidgetResize(): void {
  const bridge = window.chrome?.webview;
  if (!bridge) return;
  bridge.postMessage({ type: 'beginWidgetResize' });
}

// 레이아웃 토글 시 창 너비 변경(컴팩트↔확장). 도킹 중이면 호스트가 '예약 폭' 변경으로 처리한다.
export function setWidgetWidth(width: number): void {
  const bridge = window.chrome?.webview;
  if (!bridge) return;
  bridge.postMessage({ type: 'setWidgetWidth', width });
}

// ===== 위젯 도킹 (Windows AppBar — 작업표시줄처럼 작업 영역 예약) =====

export interface WidgetMonitor {
  id: string;        // Screen.DeviceName (예: \\.\DISPLAY2)
  label: string;
  primary: boolean;
  width: number;
  height: number;
}

export interface WidgetDockState {
  docked: boolean;
  edge: 'left' | 'right';
  monitorId: string; // 빈 문자열 = 주 모니터
  width: number;
  minWidth: number;
  maxWidth: number;
  monitors: WidgetMonitor[];
}

// 도킹 상태 변화 구독(호스트가 push). 반환값 호출로 해제.
export function onWidgetDockState(cb: (s: WidgetDockState) => void): () => void {
  const bridge = window.chrome?.webview;
  if (!bridge) return () => {};
  const handler = (e: MessageEvent) => {
    const data = e.data as (WidgetDockState & { type?: string }) | null | undefined;
    if (!data || typeof data !== 'object' || data.type !== 'widgetDockState') return;
    cb(data);
  };
  bridge.addEventListener('message', handler);
  return () => bridge.removeEventListener('message', handler);
}

// 마운트 시 현재 도킹 상태 + 모니터 목록 요청.
export function requestWidgetDock(): void {
  const bridge = window.chrome?.webview;
  if (!bridge) return;
  bridge.postMessage({ type: 'getWidgetDock' });
}

// 도킹 설정 적용. docked=false 면 해제하고 원래 플로팅 자리로 돌아간다.
export function setWidgetDock(opts: {
  docked: boolean;
  edge?: 'left' | 'right';
  monitorId?: string;
  width?: number;
}): void {
  const bridge = window.chrome?.webview;
  if (!bridge) return;
  bridge.postMessage({ type: 'setWidgetDock', ...opts });
}

// ===== 시스템 미디어(SMTC) — 위젯 Now Playing =====
export interface MediaState {
  hasSession: boolean;
  title?: string;
  artist?: string;
  thumbnail?: string | null;
  playing?: boolean;
  canPlay?: boolean;
  canPause?: boolean;
  canNext?: boolean;
  canPrev?: boolean;
  hasTimeline?: boolean;
  position?: number; // seconds
  duration?: number; // seconds
}

// 미디어 상태 변화 구독. 반환값 호출로 해제. 호스트 브릿지 없으면 no-op(해제도 no-op).
export function onMediaUpdate(cb: (m: MediaState) => void): () => void {
  const bridge = window.chrome?.webview;
  if (!bridge) return () => {};
  const handler = (e: MessageEvent) => {
    const data = e.data as (MediaState & { type?: string }) | null | undefined;
    if (!data || typeof data !== 'object' || data.type !== 'mediaUpdate') return;
    cb(data);
  };
  bridge.addEventListener('message', handler);
  return () => bridge.removeEventListener('message', handler);
}

export type MediaAction = 'play' | 'pause' | 'playpause' | 'next' | 'prev';
export function mediaControl(action: MediaAction): void {
  const bridge = window.chrome?.webview;
  if (!bridge) return;
  bridge.postMessage({ type: 'mediaControl', action });
}

// 타임라인 시작 기준 상대 위치(초)로 시크.
export function mediaSeek(seconds: number): void {
  const bridge = window.chrome?.webview;
  if (!bridge) return;
  bridge.postMessage({ type: 'mediaSeek', seconds });
}

// 위젯 마운트 시 현재 상태 재요청(초기 구독 누락 방지).
export function requestMedia(): void {
  const bridge = window.chrome?.webview;
  if (!bridge) return;
  bridge.postMessage({ type: 'mediaRequest' });
}

// ===== 최근 활성 창 =====
export interface ActiveWindowItem { app: string; title: string; seconds: number; }
export interface ActiveWindowsState { enabled: boolean; items: ActiveWindowItem[]; }

export function onActiveWindowsUpdate(cb: (s: ActiveWindowsState) => void): () => void {
  const bridge = window.chrome?.webview;
  if (!bridge) return () => {};
  const handler = (e: MessageEvent) => {
    const data = e.data as (ActiveWindowsState & { type?: string }) | null | undefined;
    if (!data || typeof data !== 'object' || data.type !== 'activeWindowsUpdate') return;
    cb({ enabled: !!data.enabled, items: data.items ?? [] });
  };
  bridge.addEventListener('message', handler);
  return () => bridge.removeEventListener('message', handler);
}

// 추적 ON/OFF (프라이버시). 끄면 네이티브가 훅 해제 + 기록 삭제.
export function setActiveWindowsEnabled(enabled: boolean): void {
  const bridge = window.chrome?.webview;
  if (!bridge) return;
  bridge.postMessage({ type: 'setActiveWindowsEnabled', enabled });
}

export function requestActiveWindows(): void {
  const bridge = window.chrome?.webview;
  if (!bridge) return;
  bridge.postMessage({ type: 'activeWindowsRequest' });
}

// ===== 알림 토스트 (최소화 시 네이티브 always-on-top 창) =====
// 메인 앱(엔진)이 창 최소화 상태에서 토스트를 호스트로 보낸다 → 호스트가 ToastForm(우리 소유 창)에
// 전달해 우하단에 표시. 우리 창이라 Windows 알림 센터에는 기록되지 않는다. 브릿지 없으면 no-op.
export interface HostToastPayload {
  severity: string;
  i18nKey: string;
  i18nParams?: Record<string, unknown>;
}

// 메인 앱 → 호스트(→ 토스트 창). fire-and-forget.
export function showHostToast(p: HostToastPayload): void {
  const bridge = window.chrome?.webview;
  if (!bridge) return;
  bridge.postMessage({ type: 'showToast', severity: p.severity, i18nKey: p.i18nKey, i18nParams: p.i18nParams ?? {} });
}

// 토스트 창(/notify-toast) 전용 — 호스트가 전달한 토스트 payload 구독. 반환값 호출로 해제.
export function onHostToast(cb: (p: HostToastPayload) => void): () => void {
  const bridge = window.chrome?.webview;
  if (!bridge) return () => {};
  const handler = (e: MessageEvent) => {
    const d = e.data as (HostToastPayload & { type?: string }) | null | undefined;
    if (!d || typeof d !== 'object' || d.type !== 'showToast') return;
    cb({ severity: d.severity, i18nKey: d.i18nKey, i18nParams: d.i18nParams });
  };
  bridge.addEventListener('message', handler);
  return () => bridge.removeEventListener('message', handler);
}

// 토스트 창 → 호스트: React 마운트(메시지 리스너 부착) 완료 신호. 호스트가 대기 중 payload 를 flush.
export function notifyToastReady(): void {
  const bridge = window.chrome?.webview;
  if (!bridge) return;
  bridge.postMessage({ type: 'toastReady' });
}

// 토스트 창 → 호스트: 표시 중인 토스트가 모두 사라짐 → 호스트가 창을 숨김.
export function notifyToastEmpty(): void {
  const bridge = window.chrome?.webview;
  if (!bridge) return;
  bridge.postMessage({ type: 'toastEmpty' });
}

// 메인 창 최소화/복원 통지 구독 — 호스트가 WindowState 변화 시 push. 반환값 호출로 해제.
// (WebView2 가 최소화 시 document.visibilityState 를 바꾸지 않으므로 이 신호가 신뢰 가능)
export function onWindowMinimized(cb: (minimized: boolean) => void): () => void {
  const bridge = window.chrome?.webview;
  if (!bridge) return () => {};
  const handler = (e: MessageEvent) => {
    const d = e.data as { type?: string; minimized?: boolean } | null | undefined;
    if (!d || typeof d !== 'object' || d.type !== 'windowState') return;
    cb(!!d.minimized);
  };
  bridge.addEventListener('message', handler);
  return () => bridge.removeEventListener('message', handler);
}

export function testServerConnection(url: string, apiKey: string | null): Promise<TestConnectionResult | null> {
  return new Promise((resolve) => {
    const bridge = window.chrome?.webview;
    if (!bridge) {
      resolve(null);
      return;
    }

    const requestId = `testConn-${++counter}-${Date.now()}`;
    const onMessage = (e: MessageEvent) => {
      const data = e.data as TestResultMsg | null | undefined;
      if (!data || typeof data !== 'object') return;
      if (data.type !== 'testServerConnectionResult' || data.requestId !== requestId) return;
      bridge.removeEventListener('message', onMessage);
      resolve({
        ok: !!data.ok,
        status: data.status ?? 0,
        error: data.error ?? null,
      });
    };
    bridge.addEventListener('message', onMessage);
    bridge.postMessage({ type: 'testServerConnection', requestId, url, apiKey });
  });
}
