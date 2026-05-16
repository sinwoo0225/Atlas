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
