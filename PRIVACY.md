# Atlas 개인정보 처리방침

> 최종 업데이트: 2026-05-29

📖 **[Read this in English ↓](#english)**

Atlas 는 **로컬 우선(local-first)** 데스크톱 앱입니다. 계정 가입도, 원격 백엔드도 없습니다. 사용자가 입력하는 모든 데이터는 사용자 본인의 PC(또는 사용자가 지정한 폴더)에만 저장되며, 개발자/운영자는 그 데이터를 수집하거나 열람하지 않습니다. 아래는 Atlas 가 어떤 데이터를 어디에 저장하고, 어떤 경우에만 외부와 통신하는지를 명확히 밝히기 위한 문서입니다.

## 1. 저장되는 데이터와 위치

Atlas 가 다루는 데이터는 전부 **사용자가 직접 입력**하며, 사용자 기기에만 보관됩니다.

- **프로젝트 데이터** (SQLite DB) — 프로젝트·WBS·이슈·회의록·변경 이력·업무 일지·개발 정보·리소스(인원/장비) 등. 여기에는 사용자가 입력한 **이름·이메일·전화번호·부서**(리소스), 작성자/수정자 이름(감사 로그), 회의 참석자 같은 개인 식별 가능 정보가 포함될 수 있습니다. 기본 위치는 `%USERPROFILE%\Documents\ProjectManager\projectmanager.db` 이며, 설정에서 다른 폴더(외부 드라이브·사내 공유 폴더 등)로 변경할 수 있습니다.
- **프로젝트별 파일** — 첨부·참조 파일, 자동 export 된 회의록/개발 정보 마크다운. 데이터 폴더 하위에 저장됩니다.
- **앱 설정** — `%LOCALAPPDATA%\Atlas\config.json` (구동 모드·데이터 폴더 경로·업데이트 설정 등, 머신 계정 전용).
- **브라우저(WebView2) 상태** — `%LOCALAPPDATA%\Atlas\WebView2\` (테마·마지막 프로젝트 등 화면 상태).
- **디버그 로그** — `%LOCALAPPDATA%\Atlas\atlas-debug.log` (로컬에만 append, 외부 전송 없음).

이 데이터의 소유권과 통제권은 전적으로 사용자에게 있습니다. **데이터 폴더를 삭제하면 데이터도 완전히 삭제됩니다.**

## 2. 외부로 나가는 통신

Atlas 가 인터넷과 통신하는 경우는 아래 **두 가지뿐이며, 모두 선택(옵트인)이고 끌 수 있습니다.** 둘 다 비활성화하면 Atlas 는 어떤 외부 호출도 하지 않습니다.

- **자동 업데이트 확인** — 새 버전이 있는지 GitHub 릴리스 API(`https://api.github.com/repos/sinwoo0225/Atlas/releases/latest`)를 주기적으로 조회합니다. 전송되는 것은 `User-Agent: Atlas-Updater` 헤더뿐이며 **개인정보나 기기 식별자는 전송하지 않습니다.** 받아오는 것은 버전·릴리스 노트·다운로드 링크입니다. 설치 파일 다운로드는 자동이지만 설치 실행은 사용자가 직접 합니다. 설정에서 끌 수 있습니다.
- **날씨 위젯** — 위젯에서 날씨를 켜고 도시를 입력한 경우에만, open-meteo 의 익명 공개 API(geocoding/forecast)로 **사용자가 입력한 도시명·좌표**를 보내 날씨를 가져옵니다. API 키나 계정이 필요 없습니다. 위젯/날씨를 끄면 호출하지 않습니다.

## 3. 제3자 / 선택 연동

- **로컬 Claude CLI 연동(선택)** — 회의록 'AI 요약' 등은 사용자 PC에 설치된 `claude` 명령을 서브프로세스로 호출합니다. Atlas 는 이 통신을 중개하지 않으며, 텍스트는 로컬 CLI 로 전달되고 해당 CLI 가 Anthropic 과 직접 통신합니다. 이 경우 [Anthropic 의 개인정보 처리방침](https://www.anthropic.com/legal/privacy)이 적용됩니다.
- **자동 백업(선택)** — 사용자가 지정한 폴더로 전체 데이터를 zip 백업합니다. OneDrive·Dropbox 같은 동기화 폴더를 지정하면 해당 클라우드 제공자의 처리방침이 적용됩니다(사용자 선택).
- **Client/Server 모드(선택)** — 팀이 같은 데이터를 공유하려고 `Atlas-Server.exe` 에 연결하면, 데이터는 사내 LAN 을 통해 **평문 HTTP** 로 전송됩니다(클라우드 동기화가 아니라 사용자/팀이 직접 운영하는 서버). 인터넷 노출이 필요하면 reverse proxy + TLS 구성은 운영자(사용자/팀)의 책임입니다.

## 4. 수집하지 않는 것

Atlas 는 다음을 **수집하지 않습니다**: 텔레메트리·사용 통계(애널리틱스)·크래시 리포팅·세션 추적·IP 주소 로깅·기기 고유 식별자·사용 행동 추적. 광고도 없습니다.

## 5. 데이터 보관·삭제

Atlas 에는 서버 측 보관 기간 개념이 없습니다. 데이터는 사용자가 직접 지울 때까지 사용자 기기에 남습니다. 앱을 제거(언인스톨)해도 데이터 폴더와 `%LOCALAPPDATA%\Atlas\` 의 파일은 자동 삭제되지 않으므로, 완전 삭제를 원하면 해당 폴더들을 수동으로 삭제하세요.

## 6. 문의

Atlas 는 개인·업무용 프로젝트 관리 도구입니다. 본 방침에 대한 문의나 제보는 GitHub 저장소의 이슈로 부탁드립니다: <https://github.com/sinwoo0225/Atlas>.

라이선스는 [`LICENSE`](./LICENSE)(MIT) 를 참고하세요. Copyright (c) 2026 SlnU.

---

## English

# Atlas Privacy Policy

> Last updated: 2026-05-29

Atlas is a **local-first** desktop app. There is no account sign-up and no remote backend. Everything you enter is stored only on your own PC (or a folder you choose), and the developer/operator neither collects nor accesses that data. This document explains exactly what data Atlas stores, where, and the only cases in which it talks to the outside world.

### 1. What is stored, and where

All data Atlas handles is **entered by you** and kept on your device.

- **Project data** (SQLite DB) — projects, WBS, issues, meetings, change logs, worklogs, dev info, and resources (people/equipment). This can include personally identifiable information you enter, such as **names, emails, phone numbers, and departments** (resources), author/editor names (audit log), and meeting attendees. The default location is `%USERPROFILE%\Documents\ProjectManager\projectmanager.db`; you can point it to another folder (external drive, corporate share, etc.) in Settings.
- **Per-project files** — attachments/reference files and auto-exported meeting/dev-info Markdown, stored under the data folder.
- **App settings** — `%LOCALAPPDATA%\Atlas\config.json` (run mode, data folder path, update settings; per machine account).
- **Browser (WebView2) state** — `%LOCALAPPDATA%\Atlas\WebView2\` (UI state such as theme and last project).
- **Debug log** — `%LOCALAPPDATA%\Atlas\atlas-debug.log` (appended locally only; never transmitted).

You own and control this data entirely. **Deleting the data folder deletes the data completely.**

### 2. Outbound communication

Atlas talks to the internet in only **two cases, both opt-in and switchable off.** Disable both and Atlas makes no external calls at all.

- **Automatic update check** — Periodically queries the GitHub Releases API (`https://api.github.com/repos/sinwoo0225/Atlas/releases/latest`) to see whether a newer version exists. The only thing sent is a `User-Agent: Atlas-Updater` header — **no personal data or device identifiers are transmitted.** It receives version, release notes, and a download link. The installer download is automatic, but running it is up to you. Can be turned off in Settings.
- **Weather widget** — Only if you enable weather in the widget and enter a city, Atlas sends **the city name / coordinates you entered** to open-meteo's anonymous public API (geocoding/forecast) to fetch weather. No API key or account is required. No calls are made if the widget/weather is off.

### 3. Third parties / optional integrations

- **Local Claude CLI (optional)** — Features like the meeting 'AI summary' invoke the `claude` command installed on your PC as a subprocess. Atlas does not proxy this; the text is passed to the local CLI, which talks to Anthropic directly. In that case [Anthropic's Privacy Policy](https://www.anthropic.com/legal/privacy) applies.
- **Automatic backup (optional)** — Zips your full data to a folder you choose. If you point it at a synced folder (OneDrive/Dropbox), that cloud provider's policy applies (your choice).
- **Client/Server mode (optional)** — If you connect to `Atlas-Server.exe` so a team can share data, the data is transmitted over your **internal LAN as plain HTTP** (a server you/your team run, not a cloud sync). Putting a reverse proxy with TLS in front for internet exposure is the operator's (your/your team's) responsibility.

### 4. What is NOT collected

Atlas does **not** collect telemetry, usage analytics, crash reports, session tracking, IP-address logging, unique device identifiers, or behavioral tracking. There are no ads.

### 5. Retention & deletion

There is no server-side retention concept. Data stays on your device until you delete it yourself. Uninstalling the app does not automatically remove the data folder or files under `%LOCALAPPDATA%\Atlas\`, so delete those folders manually if you want a complete wipe.

### 6. Contact

Atlas is a personal/work project-management tool. For questions or reports about this policy, please open an issue on the GitHub repository: <https://github.com/sinwoo0225/Atlas>.

For licensing, see [`LICENSE`](./LICENSE) (MIT). Copyright (c) 2026 SlnU.
