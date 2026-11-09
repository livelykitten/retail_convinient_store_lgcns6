# 편리 디자인 파일

화면 기준은 [피그마 Page 1 「편리 기준 화면」](https://www.figma.com/design/ag2sdNihDB8gV3ODLcTSFM?node-id=260-230)입니다. 이 폴더와 `public/assets`에는 옮길 때 쓰는 파일만 있습니다.

| 파일 | 쓰는 곳 |
|---|---|
| `design/override.css` | `style.css` 끝에 붙이면 색 · 그림자 · 칸이 바뀝니다. 기존 클래스에 덧씌우는 파일이라 동작과 API는 그대로입니다 |
| `design/reference/screens.css` | 피그마 화면의 CSS 값 원본. 새로 만드는 부품의 값은 여기서 가져옵니다. `ref-`로 시작하는 규칙은 폰 틀이라 빼고 씁니다 |
| `design/reference/screens.html` | 위 CSS를 입힌 화면 17장. 브라우저로 엽니다 |
| `design/reference/png/` | 화면별 캡처. 피그마를 못 열 때 씁니다 |
| `public/assets/brand/` | `pyeonri-logo-h.png`(머리글, 높이 40px), `pyeonri-logo.png`(시작 화면), 매장 · 결제 로고 |
| `public/assets/icons/` | 탭 · 공통 아이콘(Phosphor, MIT). `Icon name="icons/tag"`처럼 씁니다. 현재 탭은 `-fill` |
| `public/assets/category/` | 첫 화면 품목 칸 아이콘(Microsoft Fluent Emoji, MIT) |
| `public/assets/demo/` | 시연 상품 사진 |

## 피그마만 봐서는 모르는 것

**색의 뜻**

| 색 | 쓰는 곳 |
|---|---|
| 파랑 `#0040A0` | 누를 버튼 1개, 현재 탭, 지도의 도보 시간 |
| 노랑 `#FFC400` | 경로 선, 목적지 핀 테두리, 지도 탭 점. 면 · 글자 · 가격 강조에는 쓰지 않습니다 |
| 빨강 `#C4493F` | 할인율 숫자에만, 가격보다 작게. 1+1은 회색입니다 |

**지도 경로 선**: `Polyline` 2개를 겹칩니다. 아래 `#0040A0` 굵기 8, 위 `#FFC400` 굵기 4.5, 둘 다 `solid`.

**문구**: 표기만 바꾸고 값과 API는 그대로입니다.

| 지금 | 바꿀 문구 |
|---|---|
| 가까운 순 · 싼 순 | 거리순 · 가격 낮은순 |
| 여기로 길 안내 | 길찾기 |
| 지도에서 길 보기 | 지도 보기 |
| 가장 싸고 가까워요 · 가장 싸요 | 최저가 · 가장 가까움 · 최저가 |

피그마의 가격 · 거리 · 매장 이름은 예시 값입니다. 지도 바탕은 자리표시이고 실제는 카카오 지도입니다.
