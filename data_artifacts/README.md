# 상품 데이터 산출물

- `20261110/catalog_cleaned_20261110/`: 최종 정제 CSV, 삭제 내역, 유지한 검토 항목, 정제 보고서
- `20261110/catalog_verified_20261110/`: 정제 전 4사 통합 검증 결과
- `20261110/catalog_integrated_20261110/`, `catalog_emart_recovery_20261110/`, `catalog_final_20261110/`: 수집·복구·중간 통합 결과
- `20261110/category_audit_output/`: 카테고리 참고 표본과 감사 결과
- `20261110/seven_csv_output/`: 기존 세븐일레븐 수집 결과

앱은 `backend/src/main/resources/data/`의 CSV를 사용합니다. 이 디렉터리의 파일은 수집 재현·데이터 검토를 위한 보관본입니다.
CSV와 JSON 보고서는 Git에 포함할 수 있습니다. 큰 원본 응답 파일 `raw_responses.jsonl`은 로컬에 보관하되 Git에서 제외합니다.
과거 보고서의 파일 경로는 생성 당시 값이며 현재 파일 위치와 다를 수 있습니다.

실행 방법: [수집기 README](../tools/catalog/README.md).
