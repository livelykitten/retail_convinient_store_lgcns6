# 편리 React 프론트엔드

React + TypeScript + Vite. Figma `ag2sdNihDB8gV3ODLcTSFM`의 「편리 · B 매대 가격표 · 전체 화면 (11.09)」(`135:6204`)을 기준으로 구현했습니다. 앱 시작, P1~P4 상품 검색과 매장 선택, M1~M3 지도·경로·위치 오류, D1~D4 할인 수단 관리 화면을 제공합니다.

## 실행

```powershell
cd frontend
npm.cmd install
npm.cmd run dev:demo
```

출력된 로컬 주소를 엽니다. 시작 화면의 가격표 또는 시작하기를 누른 뒤 `우유`, `바나나`, `커피`, `라떼`로 예시 검색을 할 수 있습니다. 다른 검색어는 빈 결과를 표시합니다. 정렬, 상품 펼침, 목적지 선택, 지도 탭 전환, 할인 수단 등록·수정·삭제를 조작할 수 있습니다.

실제 API 모드는 `npm.cmd run dev`입니다. 개발 서버는 `/api`를 `http://localhost:8080`으로 프록시합니다. 현재 저장소의 백엔드는 앱 시작 코드만 있어 4개 API의 별도 구현이 필요합니다. 예시 모드가 실제 API로 자동 전환되거나, 실제 API 오류가 예시 데이터로 대체되는 동작은 없습니다.

## 환경 변수

`.env.example`을 참고하여 `.env.local`에 설정하거나 실행 환경에서 주입합니다. 실제 키는 커밋하지 않습니다.

| 변수 | 용도 |
| --- | --- |
| `VITE_API_BASE_URL` | 실제 백엔드 주소. 생략하면 동일 출처이며 개발 서버에서만 위 프록시를 사용합니다. 다른 출처라면 백엔드 CORS 허용이 필요합니다. |
| `VITE_KAKAO_JAVASCRIPT_KEY` | 지도 JavaScript SDK용 키. 카카오 개발자 콘솔에서 실행 도메인을 등록합니다. REST API 키는 프론트에 넣지 않습니다. |
| `VITE_USE_FIXTURES` | 정확히 `true`이면 개발·프로덕션 모두 데모 모드입니다. `false` 또는 미설정이면 실제 API 모드이며 API 오류 시 자동으로 예시 데이터로 전환하지 않습니다. `dev:demo`에서 자동 설정됩니다. |

Vite의 `VITE_` 변수는 브라우저 번들에 포함됩니다. 서버 REST API 키·LLM 키를 이 접두어로 주입하지 않습니다. 카카오 SDK 사용 방식은 [공식 Web API 문서](https://apis.map.kakao.com/web/documentation/)를 따릅니다.

## Vercel 프로덕션 데모 배포

1. 프로젝트의 Root Directory를 `frontend`, Framework Preset을 `Vite`, Build Command를 `npm run build`, Output Directory를 `dist`로 설정합니다.
2. Settings → Environment Variables에서 `VITE_USE_FIXTURES` 값을 `true`로 등록하고 **Production** 환경을 선택합니다. Preview 배포에서도 데모를 사용하려면 Preview에도 등록합니다.
3. 배포하거나 기존 배포를 Redeploy합니다. 환경 변수는 빌드 시 번들에 반영되므로 변경 후 새 배포가 필요합니다.

| Vercel 환경 변수 | 데모 배포 설정 |
| --- | --- |
| `VITE_USE_FIXTURES` | `true` (필수). `false` 또는 삭제 후 재배포하면 실제 API 모드로 복귀합니다. |
| `VITE_API_BASE_URL` | 백엔드 없는 데모에서는 생략합니다. 실제 API 모드에서 사용할 때는 접근 가능한 HTTPS 백엔드 주소를 설정합니다. 개발용 localhost 프록시는 Vercel 배포에서 동작하지 않습니다. |
| `VITE_KAKAO_JAVASCRIPT_KEY` | 지도 표시가 필요할 때만 설정합니다. 카카오에 Vercel 배포 도메인도 등록해야 합니다. 미설정이면 기존 지도 오류 안내를 유지합니다. |

프로덕션 데모에서도 기존 상단 예시 데이터 배너와 재고의 `예시 데이터` 표시가 유지됩니다. 검색·정렬·매장 선택·할인 수단 관리·브라우저 저장 기능을 시연할 수 있습니다. 할인 수단은 해당 배포 도메인의 브라우저 저장소에 저장됩니다. 실제 도보 경로는 데모에서 제공하지 않으며, 지도 키나 경로 API가 없다고 임의 경로를 만들지 않습니다.

로컬에서도 프로덕션 데모 빌드를 확인할 수 있습니다.

```powershell
$env:VITE_USE_FIXTURES = 'true'
npm.cmd run build
Remove-Item Env:VITE_USE_FIXTURES
```

빌드·환경 변수 반영 방식: [Vercel 환경 변수 문서](https://vercel.com/docs/environment-variables), [Vercel Vite 문서](https://vercel.com/docs/frameworks/frontend/vite).

## 데이터와 지도

- 실제 API 경로는 `GET /api/wallet-options`, `POST /api/quotes`, `GET /api/stores`, `GET /api/routes/walking`입니다. 첨부 API명세최종.md v1.1을 계약 기준으로 사용했습니다. 기존 `docs/design.md`의 이전 계약을 따라 TMAP을 호출하거나 가격을 재계산하지 않습니다.
- API 모드에서는 서버가 제공한 가격·정렬·적용 가능 수단을 사용합니다. 목록 도보시간은 추정 `walkMin`, 지도 경로시간은 `Math.ceil(durationSeconds / 60)`입니다.
- 지도는 브라우저 위치를 사용합니다. 위치 실패 시 경로 API를 호출하지 않습니다. 상품 검색에만 명세 예시 교육장 좌표 `127.0563, 37.5446`을 사용합니다. 현재 위치를 성수동으로 단정하지 않습니다.
- 실제 지도·브랜드 마커·목적지·Polyline은 카카오 SDK로 표시합니다. `path` 순서를 유지하며 위도/경도 순서로 변환합니다. 지도 키나 API가 없으면 오류를 표시합니다.
- 데모 모드는 개발·프로덕션 모두 상단 배너로 구분합니다. 예시 가격은 고정값으로 프론트 할인 계산을 구현하지 않았습니다. 예시 모드에서는 실제 경로 성공값을 만들지 않으며, 지도 탭은 위치 권한·지도 키가 별도로 필요합니다.
- 재고는 명세상의 예시 데이터이므로 모든 재고 표시 옆에 `예시 데이터`를 붙입니다. 매장마다 취급 상품이 다를 수 있다는 문구를 유지합니다.
- 할인 수단은 `localStorage['pyeonri.wallet']`에 API 요청 wallet 모양으로 저장합니다. 목적지 하나는 `sessionStorage['pyeonri.destination']`에 보관합니다. 위치 정보는 저장하지 않습니다.
- 별도 `logos/`는 제공된 경로에서 찾지 못해 Figma의 DiscountIcon 표현을 사용했습니다. 정적 SVG 20개는 Figma에서 내려받아 `public/assets/`에 보관했습니다. 서체도 패키지에 포함되어 외부 폰트 서버를 호출하지 않습니다.

## 검증

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
```

Vitest와 React Testing Library로 API 본문·좌표·오류, 검색·정렬·매장 펼침·목적지 전환, 할인 수단 CRUD·직접 입력·요청 반영, 저장 상태 복원, 위치 거부, 경로 성공과 실패를 검증합니다. 지도 SDK는 테스트 대역을 사용해 Polyline 경로 좌표와 정리를 확인합니다. 실제 카카오 서버 응답을 검증한 것은 아닙니다.

로컬 HTTP 응답은 확인했지만 Windows 브라우저 제어 도구가 현재 URL을 확인하지 못해 자동 화면 검증이 중단됐습니다. 따라서 360×800 실브라우저 스크린샷과 픽셀 비교 결과는 제공하지 못했습니다. 실제 지도·도보 경로 통합 확인에는 API 구현, 지도 키 및 위치 권한이 필요합니다.

설치 결과 개발 의존성에서 moderate 취약점 9건이 보고되었습니다. 상세 audit는 이전 실행에서 승인되지 않아 확인하지 않았으며 강제 버전 변경은 하지 않았습니다.

## 파일 구성

- `src/App.tsx`, `main.tsx`, `style.css`: 앱 상태, 탭, 시작 화면, 모바일 레이아웃.
- `src/Products.tsx`, `Wallet.tsx`, `MapView.tsx`, `ui.tsx`: 기능 화면과 공통 UI.
- `src/api.ts`, `types.ts`, `location.ts`, `storage.ts`, `kakao.ts`: API 계약, 위치·저장·지도 SDK.
- `src/fixtures.ts`: 개발 예시 데이터.
- `src/api.test.ts`, `api.demo.test.ts`, `App.test.tsx`: 단위·UI 통합 테스트. 프로덕션 환경의 데모 활성화, 실제 API 모드 유지, 자동 fallback 금지, 가짜 경로 미생성을 검증합니다.
- `public/assets/`: Figma 원본 SVG.
- `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `index.html`, `.env.example`, `.env.demo`, `.gitignore`: 실행·빌드·검사 설정.

