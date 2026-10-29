# 만기 월드 (Mangi World)

Canvas로 그리는 싱글플레이 액션 RPG입니다. 게임 본체는 **`index.html` 한 파일**이며 CSS, JavaScript, 타일 이미지가 포함되어 있습니다. 서버 API, 계정, 빌드 또는 런타임 npm 패키지가 필요하지 않습니다. Google Fonts를 불러오지 못해도 기본 글꼴로 동작합니다.

## 실행

저장소 루트에서 Python 3 정적 서버를 실행합니다.

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

브라우저에서 이 서버의 `index.html`을 엽니다. Node.js가 설치되어 있다면 `npm start`도 같은 서버를 실행합니다. 게임 실행만을 위해 `npm install`을 할 필요는 없습니다. `index.html.html`은 별도 과거 사본이며 현재 실행·테스트 대상은 `index.html`입니다.

## 개발과 검증

Node.js 20 이상과 Python 3을 사용합니다. Playwright는 개발용 의존성입니다.

```sh
npm ci
npx playwright install chromium
npm test
```

Linux에서 브라우저 실행용 시스템 라이브러리가 없다면 Playwright의 공식 `npx playwright install --with-deps chromium` 명령을 사용합니다. 시스템 Chromium이 `/usr/bin/chromium`에 있으면 테스트가 이를 사용하므로 별도 브라우저 다운로드는 필요하지 않습니다. 다른 경로는 `CHROMIUM_PATH`로 지정할 수 있습니다.

클라우드 환경처럼 홈 디렉터리에 npm 캐시를 쓸 수 없는 경우:

```sh
npm ci --cache /tmp/mangiworld-npm-cache
npm test
```

개별 검증은 `npm run test:save`, `npm run test:session`으로 실행합니다. 테스트는 자체 임시 서버와 격리된 브라우저 저장 공간을 만들고 종료 시 정리합니다. 게임 서버를 미리 실행할 필요가 없습니다. 실패는 0이 아닌 종료 코드로 반환됩니다.

GitHub Actions는 `main` 푸시와 PR에서 같은 테스트를 실행하도록 구성되어 있습니다. 테스트의 전제·검증 범위는 [tests/README.md](tests/README.md)를 참고하세요.

## 상태와 저장 코드 수정 시

단일 HTML을 유지하면서 저장과 세션 전환의 책임을 구분합니다.

| 책임 | 함수·데이터 |
| --- | --- |
| 저장 데이터 생성 | `getSaveData` |
| 파일 검증과 구버전 변환 | `normalizeSaveData` |
| 검증 완료 데이터와 장비·아이템 준비 | `prepareSavedSession` |
| 일시 상태·애니메이션·타이머 정리 | `resetSessionRuntime` |
| 대화창·알림·HUD 정리 | `resetSessionPresentation` |
| 준비된 진행 데이터 적용과 UI 갱신 | `restoreSessionState` |
| 불러오기 후 플레이 시작 | `applySaveData` |
| 시작 상태 | 입력 전 초기값을 보관한 `INITIAL_GAME_SAVE`, `INITIAL_PLAYER_STATE` |

- 새 게임은 초기 진행 데이터를 복원한 뒤 도입 스토리를 시작합니다. 다른 슬롯의 레벨·퀘스트·장비·각성을 이어받지 않습니다.
- 불러오기는 검증과 아이템 준비에 성공한 뒤에만 현재 세션을 교체합니다. 잘못된 파일 때문에 진행 중인 게임의 효과나 루프를 중단하지 않습니다.
- 메인 메뉴 복귀는 필요 시 자동 저장에 성공한 뒤 초기 상태로 돌아갑니다. 새로고침 없이 돌아오므로 페이지 종료 이벤트가 중복 저장하지 않습니다.
- 저장하지 않는 전투 효과·버프·빙결·투사체·위험 구역·보스 재소환 대기·훈련 기록·쿨타임은 새 게임/불러오기에서 초기화합니다. 지속되어야 하는 진행도는 저장 형식에 명시적으로 추가해야 합니다.
- 소리·화면 흔들림·자동 저장의 현재 설정과 정적 이미지·아이콘 캐시는 세션 전환 중 유지합니다. 설정의 브라우저 재실행 간 영속성 확대는 별도 작업입니다.
- 세션을 변경하는 지연 작업은 `setSessionTimeout`과 `clearSessionTimeout`을 사용합니다. 새 세션으로 이전 콜백이 넘어가지 않도록 정리 대상에 포함됩니다.
- 스토리와 게임의 `requestAnimationFrame`은 각각 하나만 유지합니다. 새 전역 상태·효과·타이머를 추가할 때 초기화 경로와 회귀 테스트도 함께 확인합니다.

저장 형식은 버전 3을 유지하며 v3.4.2 저장과 호환됩니다. 중요한 저장은 브라우저 삭제·기기 변경에 대비해 파일로 내보내세요.
