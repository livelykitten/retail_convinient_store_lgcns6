# 편의점 결제액 비교 (4팀 리테일)

LG CNS AM Inspire Camp 6기 해커톤 4팀 저장소예요. 근처 편의점 4사의 품목 · 가격을 내 결제 수단 기준 최종 결제액으로 찾아요.

| 폴더 | 내용 |
| --- | --- |
| [backend/](backend/) | Spring Boot 애플리케이션 |
| [frontend/](frontend/) | 프런트엔드 |
| [docs/](docs/README.md) | 설계, 역할 분담, 협업 규칙, 코드 규칙, AI 사용 규칙, 요구사항 · API · ERD 사본 |

## 백엔드 실행

```bash
cd backend
./gradlew bootRun
```

카카오 · AI 키는 환경 변수로 넣어요. 변수 이름은 [docs/design.md](docs/design.md#5-외부-api)에 있어요.
