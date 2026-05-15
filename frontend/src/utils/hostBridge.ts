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

interface PickFolderResult {
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
      const data = e.data as PickFolderResult | null | undefined;
      if (!data || typeof data !== 'object') return;
      if (data.type !== 'pickFolderResult' || data.requestId !== requestId) return;
      bridge.removeEventListener('message', onMessage);
      resolve(data.path ?? null);
    };
    bridge.addEventListener('message', onMessage);

    bridge.postMessage({ type: 'pickFolder', requestId, initialPath });
  });
}
