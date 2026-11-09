# 편리 React 프론트엔드

React + TypeScript + Vite. Figma `ag2sdNihDB8gV3ODLcTSFM`의 「편리 · B 매대 가격표 · 새 디자인 v1 (11.09)」(`188:3636`)을 기준으로 구현했습니다. 색·간격은 `src/style.css`의 `:root` 변수로만 씁니다. 앱 시작, P1~P4 상품 검색과 매장 선택, M1~M3 지도·경로·위치 오류, D1~D4 할인 수단 관리 화면을 제공합니다.

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

프로덕션 데모에서도 상단 예시 데이터 배너와 재고의 `예시 데이터` 표시가 유지됩니다. 검색·정렬·매장 선택·할인 수단 관리·브라우저 저장 기능을 시연할 수 있습니다. 할인 수단은 해당 배포 도메인의 브라우저 저장소에 저장됩니다. 경로는 아래의 PPT 전용 고정 예시만 제공하며 실제 길찾기 결과가 아닙니다. 지도 키가 없으면 지도 오류 안내를 유지합니다.

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
- 실제 API 모드의 지도는 브라우저 GPS와 실제 매장·경로 좌표를 사용합니다. 위치 실패 시 경로 API를 호출하지 않습니다. 상품 검색에는 위치 실패 시 기본 좌표 `127.0563, 37.5446`을 사용합니다.
- 데모 지도·검색은 GPS를 사용하지 않고 신당동 발표 장소 좌표를 사용합니다(`src/demoLocation.ts`). GPS 권한 없이도 강의장 중심 약 500m 반경의 예시 지도를 볼 수 있으며, `신당동 강의장 예시 지도 · 실제 내 위치 아님`으로 명시합니다. 내 위치 마커는 표시하지 않고 중심 이동 버튼도 예시 중심으로 이동합니다. 실제 API 모드의 기본 검색 좌표는 변경하지 않습니다.
- 실제 지도·브랜드 마커·목적지·Polyline은 카카오 SDK로 표시합니다. `path` 순서를 유지하며 위도/경도 순서로 변환합니다. 지도 키나 API가 없으면 오류를 표시합니다.
- 데모 모드는 개발·프로덕션 모두 상단 배너로 구분합니다. SKT 등록 여부에 따른 고정 가상 가격과 도로 형태를 참고한 예시 경로만 제공합니다. 실제 할인 계산·경로 검증 결과가 아닙니다. 지도 표시는 카카오 지도 키가 필요하며, 위치 권한은 실제 API 모드의 내 위치·경로 안내에만 필요합니다.
- 재고는 명세상의 예시 데이터이므로 모든 재고 표시 옆에 `예시 데이터`를 붙입니다. 매장마다 취급 상품이 다를 수 있다는 문구를 유지합니다.
- 할인 수단은 `localStorage['pyeonri.wallet']`에 API 요청 wallet 모양으로 저장합니다. 목적지 하나는 `sessionStorage['pyeonri.destination']`에 보관합니다. 위치 정보는 저장하지 않습니다.
- 별도 `logos/`는 제공된 경로에서 찾지 못해 브랜드·결제 수단은 회색 칩에 이름 앞 1~2글자로 표시합니다. 정적 SVG는 Figma에서 내려받아 `public/assets/`에 보관하고, 마스크로 써서 글자색으로 칠합니다. 서체는 Pretendard(`pretendard` 패키지)이며 외부 폰트 서버를 호출하지 않습니다.

## 검증

### 발표 장소 데모 좌표

확인일: 2026-11-09. 중심 주소는 **서울특별시 중구 다산로36길 11, 동산빌딩(신당동)**입니다. [주소가의 동산빌딩 주소·좌표](https://jusoga.com/b/1114016200102910048003446/)에서 위도 `37.562768271563`, 경도 `127.0161468688`을 확인했습니다.

| 매장 | 주소 | 경도(x) | 위도(y) | 직선거리(추정) | 도보시간(추정) |
| --- | --- | --- | --- | --- | --- |
| GS25 신당퍼스트점 | 다산로36길 14 | 127.0160011385 | 37.562617536025 | 21m | 약 1분 |
| CU 신당다산로점 | 다산로34길 23 | 127.0161509 | 37.5617411 | 114m | 약 2분 |
| 세븐일레븐 신당점 | 다산로36길 53 | 127.017856 | 37.561518 | 205m | 약 4분 |

출처는 매장명·주소와 해당 주소의 대표 좌표를 대조한 것입니다. 출입구의 정밀 좌표나 실시간 영업 여부를 확인한 것은 아닙니다.

- GS25: [매장명·주소](https://store114.net/store/detail.asp?seq=AxEtAgJ3AxEqAwdN), [주소가의 주소 좌표](https://jusoga.com/b/1114016200102910018003553/).
- CU: [매장명·주소와 좌표](https://findby.co.kr/details/04586-111404103054-st-652c0c97f27008be2c56a18d), [상비약 판매업소 주소 확인](https://otcmed.ayo.pe.kr/otcmed/c798dfc4c73bbecbcb8ccce70ac12485).
- 세븐일레븐: [매장명·주소](https://store114.co.kr/store/detail.asp?seq=11133884), [동일 주소의 인허가 자료에 표기된 대표 좌표](https://ygp.purpleo.co.kr/view/7598).

상품 목록의 `distanceM`은 중심과 매장 대표 좌표 사이의 구면 직선거리(지구 반경 6,371km)를 m로 반올림한 값이며, `walkMin = ceil(distanceM / 67)`입니다. 실제 보행 경로가 아니며 도로·횡단보도·건물 출입구는 반영하지 않습니다. 행사 가격·할인 수단·재고는 이 매장들의 실제 판매·재고 정보가 아닙니다. 지도 경로의 거리·시간은 아래 예시 선의 길이 기준이므로 목록의 직선거리·시간과 다릅니다.

### PPT 캡처용 할인·경로 시나리오

`VITE_USE_FIXTURES=true`에서만 적용됩니다. 실제 발표는 백엔드 연동 버전을 사용합니다.

1. 기존 목적지가 있으면 지도에서 해제하고, SKT가 등록되어 있다면 삭제합니다.
2. `우유` 또는 `바나나`를 검색하고 `싼 순`을 선택한 뒤 바나나맛우유를 펼칩니다. GS25 신당퍼스트점 **1,000원**이 추천이며 CU 신당다산로점은 **1,200원**입니다. 다른 매장 목록을 펼치면 두 가격을 함께 캡처할 수 있습니다.
3. 할인 수단 → 할인 수단 추가 → SKT → VIP → 추가 후 상품 목록으로 돌아옵니다. 등급은 어느 것을 선택해도 동일한 발표용 가상 할인입니다. CU에만 가상 **25%** 할인(1,200원 → **900원**)이 적용되어 개당 최저가·추천 매장이 CU로 바뀝니다. GS25는 1,000원, 카페라떼는 1,250원으로 유지됩니다. 기존 검색 결과도 자동 갱신됩니다.
4. CU의 `여기로 길 안내`를 누르면 강의장 출발 예시 경로선·추정 시간·거리가 표시됩니다. GS25·세븐일레븐도 고정 경로가 있습니다. 경로 캡처에는 카카오 JavaScript 지도 키와 허용 도메인 설정이 필요합니다.
5. SKT를 삭제하면 CU 1,200원·GS25 1,000원으로 복원됩니다. 목적지가 없으면 추천도 GS25로 복원됩니다. 사용자가 이미 고른 목적지는 임의로 바꾸지 않으며, 해당 목적지의 가격과 sessionStorage 저장값만 갱신합니다. 추천을 다시 캡처하려면 목적지를 해제합니다.

가격·할인율은 실제 SKT/CU 제휴 조건이 아닌 **PPT용 가상 데이터**입니다. 다른 할인 수단의 등록·수정·삭제는 유지하되 가격은 바꾸지 않습니다. 상품 내 매장은 가상 개당 가격 → 거리순으로 제공하고, 상품 목록 정렬은 선택한 가격순/거리순을 따릅니다.

`src/demoRoutes.ts`의 고정 경로는 2026-11-09에 조회한 OpenStreetMap 도로 중심선([다산로36길](https://www.openstreetmap.org/way/420089386), [청구로4길](https://www.openstreetmap.org/way/420092888), [다산로34길](https://www.openstreetmap.org/way/381802870))을 참고합니다. 건물 대표 좌표와 도로 사이의 연결은 발표용 보간이며 **출입구·횡단 가능 여부·보행 가능 여부·최단 경로는 검증하지 않았습니다**. 지도에는 점선과 `예시 경로 · 실제 길찾기 결과 아님` 및 미검증 안내를 함께 표시합니다. 거리와 시간은 예시 선 길이와 분당 67m로 산출한 추정값입니다. 출처: © OpenStreetMap contributors, [ODbL](https://www.openstreetmap.org/copyright). 임의의 출발점·목적지에는 경로를 생성하지 않습니다.

### 실행 명령

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
- `src/fixtures.ts`, `demoRoutes.ts`: 발표용 가상 할인 데이터와 고정 예시 경로. 실제 API 모드에서는 사용하지 않음.
- `src/api.test.ts`, `api.demo.test.ts`, `App.test.tsx`, `MapView.test.tsx`, `fixtures.test.ts`: 단위·UI 통합 테스트. 프로덕션 데모 활성화, 실제 API 모드 유지, 자동 fallback 금지, 할인 전후·삭제 시 가격과 추천 변경, 고정 예시 경로 표시를 검증합니다.
- `public/assets/`: Figma 원본 SVG.
- `package.json`, `package-lock.json`, `vite.config.ts`, `tsconfig.json`, `eslint.config.js`, `index.html`, `.env.example`, `.env.demo`, `.gitignore`: 실행·빌드·검사 설정.

