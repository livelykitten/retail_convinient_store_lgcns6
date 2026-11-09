# AGENTS.md

AI 도구가 이 저장소에서 일할 때 자동으로 읽는 파일이에요. 도구가 루트에서만 찾기 때문에 여기 두고, 자세한 규칙은 `docs/`에 있어요. **작업을 시작하기 전에 아래 문서 중 필요한 것을 먼저 읽어요.**

| 문서 | 언제 읽나 |
| --- | --- |
| [docs/ai-guidelines.md](docs/ai-guidelines.md) | 항상. AI가 할 수 있는 것과 없는 것 |
| [docs/reference/](docs/reference/requirements.md) | 요구사항 · 계산 규칙 · API · 테이블을 다룰 때. **스펙의 기준** (요구사항명세서 사본) |
| [docs/design.md](docs/design.md) | 모듈 경계, 모듈 간 인터페이스, quotes 흐름을 다룰 때 |
| [docs/code-convention.md](docs/code-convention.md) | 코드를 쓸 때 |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | 브랜치 이름 · 커밋 메시지 · PR 초안을 쓸 때 |
| [docs/roles.md](docs/roles.md) | 담당자와 담당 모듈을 확인할 때 |

## 반드시 지킬 것

1. **git과 GitHub에 흔적을 남기는 동작은 하지 않아요.** 브랜치 생성 · 전환, `git add` · `commit` · `push` · `merge` · `rebase` · `reset`, PR 생성, 리뷰 게시, 승인, 병합은 사람이 해요. AI는 그 내용의 초안만 써요. 읽기 명령(`git status`, `git diff`, `git log`)은 써도 돼요.
2. **담당 모듈 패키지 밖을 고치지 않아요.** 필요하면 먼저 사람에게 물어요.
3. **다른 모듈의 Repository · 엔티티를 직접 쓰지 않아요.** 그 모듈의 Service 메서드를 불러요.
4. **스펙을 추측하지 않아요.** `docs/reference/`에 없는 경로 · 필드 · enum · 오류 코드는 만들지 말고 확인할 것으로 남겨요. 필드 이름은 명세에서 복사해요.
5. **계산 규칙과 API 계약은 사람이 정해요.** 규칙이 모호하면 멈추고 질문해요.
6. **비밀 값(카카오 · AI 키)을 코드나 설정 파일에 쓰지 않아요.** 환경 변수로 받아요. 카카오 API 응답을 파일로 저장하지 않아요.
7. **실행 확인 없이 완료라고 하지 않아요.** `backend/`에서 `./gradlew test`로 확인하고 결과를 그대로 알려요.

## 프로젝트 요약

- 근처 편의점 4사(CU · GS25 · 세븐일레븐 · 이마트24)의 품목 · 가격을 내 결제 수단 기준 최종 결제액으로 찾는 서비스예요. LG CNS AM Inspire Camp 6기 해커톤 4팀.
- 백엔드는 **Spring Boot 애플리케이션 1개(모놀리스)**예요. 모듈(`common` · `product` · `discount` · `quote` · `store` · `category`)끼리는 메서드 호출로 이어져요.
- Java 17, Spring Boot 4.1.2, Spring Data JPA, H2, Lombok. 외부 API는 카카오 로컬, LLM.
- 범위 밖: 로그인 · 결제 · 실시간 가격 수집 · 실제 재고 연동.
