# 문서

4팀 리테일(편의점 결제액 비교) 백엔드 문서는 모두 이 폴더에 있어요. 백엔드는 **Spring Boot 애플리케이션 1개(모놀리스)**이고, 모듈끼리는 메서드 호출로 이어져요.

| 문서 | 내용 | 누가 고치나 |
| --- | --- | --- |
| [design.md](design.md) | 설계: 모듈 구성, 모듈 간 인터페이스, `POST /api/quotes` 흐름, 데이터 적재, 외부 API, 아직 정하지 않은 것 | 스펙 변경 합의 후 누구나 |
| [roles.md](roles.md) | 백엔드 4명 역할 분담, FR별 담당, 스프린트별 할 일 | 팀 합의 |
| [CONTRIBUTING.md](CONTRIBUTING.md) | 브랜치 → 커밋·push → PR → 리뷰 → 병합 5단계, 커밋·브랜치 이름 규칙 | 팀 합의 |
| [code-convention.md](code-convention.md) | 패키지 구조, 이름, API·오류·DB·로그·테스트 규칙 | 팀 합의 |
| [ai-guidelines.md](ai-guidelines.md) | AI 도구를 쓸 때 지킬 것 | 팀 합의 |
| [reference/requirements.md](reference/requirements.md) | 요구사항 목록(FR · NFR), 최종 결제액 계산 규칙, 재고 더미 규칙. 요구사항명세서 1~3절 사본 | 요구사항명세서를 먼저 고친 뒤 |
| [reference/api-spec.md](reference/api-spec.md) | API 5개의 요청·응답·오류. 요구사항명세서 5절 사본 + 담당 · 검증 규칙 | 요구사항명세서를 먼저 고친 뒤 |
| [reference/erd.md](reference/erd.md) | 테이블 2개(`product`, `discount_rule`)의 ERD와 칼럼 명세. 요구사항명세서 4절 기반 | 함석원 (스키마 변경은 이서현 리뷰) |

## 표시 규칙

문서 곳곳에 아래 표시가 있어요. 정해지면 표시를 지우고 값만 남겨요.

| 표시 | 뜻 |
| --- | --- |
| `(안)` | 제안값이에요. 괄호 안의 사람이 바꿀 수 있어요 |
| `미정(정하는 사람)` | 아직 정하지 않았어요. 정하는 사람을 함께 적어요 |
| `(명세 확인)` | 요구사항명세서에 있는 값이라 사본을 옮겨 와야 해요 |

## 어디에 무엇을 남기나

| 정보 | 둘 곳 |
| --- | --- |
| 요구사항, 계산 규칙, API 계약의 원본 | 요구사항명세서 (저장소 밖). 바꾸려면 PM2(민경완)에게 먼저 말해요 |
| 요구사항명세서에서 옮겨 온 요구사항 · 계산 규칙 · API · 테이블 | `docs/reference/` |
| 작업 방식, 코드 규칙, 설계 | `docs/` |
| 누가 무엇을 맡았나 | [roles.md](roles.md)의 "사람별 할 일" |
| 어디까지 했나 | GitHub PR (작업을 시작할 때 Draft PR). **진행 상황 문서를 따로 만들지 않아요** |
| 개별 작업의 맥락 | PR 본문(관련 FR, 완료 기준). AI에게는 FR 번호와 할 일을 직접 알려 줘요 |

## 처음 온 사람이 읽는 순서

1. [roles.md](roles.md)에서 내 모듈, FR, "함께 보는 사람"
2. [design.md](design.md)의 모듈 간 인터페이스와 `POST /api/quotes` 흐름
3. [CONTRIBUTING.md](CONTRIBUTING.md)의 "처음 한 번 할 일"
4. [code-convention.md](code-convention.md)
5. AI 도구를 쓴다면 [ai-guidelines.md](ai-guidelines.md)

## 저장소 구조

```
(저장소 루트)/
├─ backend/        # Spring Boot 애플리케이션 (Gradle). 백엔드 4명이 함께 써요
├─ frontend/       # 프런트엔드 (강태현 · 민경완)
├─ docs/           # 이 폴더
├─ .github/        # PR 템플릿
├─ AGENTS.md       # AI 도구가 읽는 규칙 입구
└─ CLAUDE.md       # Claude Code가 읽는 입구 (AGENTS.md를 불러옴)
```

## 문서 밖에 있는 규칙 파일

도구가 정해진 위치에서만 읽기 때문에 `docs/` 밖에 둔 파일이에요. 내용은 이 폴더의 문서를 따르고, 고칠 때는 문서와 함께 고쳐요.

| 파일 | 읽는 도구 | 내용 |
| --- | --- | --- |
| `AGENTS.md` (루트) | Codex, Cursor 등 AI 도구 | 반드시 지킬 것과 이 폴더 안내 |
| `CLAUDE.md` (루트) | Claude Code | `AGENTS.md`와 `ai-guidelines.md`를 불러와요 |
| `.github/pull_request_template.md` | GitHub | PR 템플릿 |
