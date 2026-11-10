# 4사 상품 통합 수집기

Python 3.10 이상, 표준 라이브러리만 사용합니다. 소스·테스트·참고 상품명은 `tools/catalog/`, 수집·정제 산출물은 `data_artifacts/`에 둡니다. 다음 명령은 저장소 루트에서 실행합니다.
`audit_store_categories.py`, `final_seven_collector.py`의 HTTP·응답 파싱·분류·증정품 판별·CSV 쓰기 기능을 재사용합니다. 함께 배포해야 합니다.
상품명은 `catalog_normalization.py`에서 팀 이름 규칙 v1.0을 적용합니다. 백엔드 CSV를 자동으로 덮어쓰지 않습니다.

```powershell
py -3 tools/catalog/collect_catalog.py --out-dir data_artifacts/catalog_run_01
py -3 -m unittest discover -s tools/catalog -p "test_*.py" -v
```

`py`가 PATH에 없다면 설치된 Python 실행 파일을 직접 사용합니다.

## 저장소 구조와 Git 포함 범위

```text
tools/catalog/                    수집기·정규화·테스트·README
  reference/name_report.csv       공유된 상품명 참고 자료
data_artifacts/20261110/          기존 수집·검증·정제 결과
  category_audit_output/          기본 카테고리 참고 CSV
  seven_csv_output/               기존 세븐 결과 비교 자료
  catalog_cleaned_20261110/       최종 정제 CSV와 삭제·검토 보고서
data_artifacts/catalog_output_*/  이후 통합 수집의 기본 출력
backend/src/main/resources/data/  앱이 실제 적재하는 CSV
```

소스·참고 CSV·정제 결과·검토 보고서는 Git에 포함합니다. 큰 `raw_responses.jsonl`만 `.gitignore`로 제외하며, 로컬에는 그대로 보존합니다. 오프라인 재생에 필요한 원본 응답은 별도로 전달해야 합니다.

기본 입력·출력 및 스키마 경로는 실행 디렉터리가 아니라 저장소 위치를 기준으로 찾습니다. `--name-report`를 생략하면 `reference/name_report.csv`, `--category-samples`를 생략하면 보관한 카테고리 표본을 사용합니다. 사용자가 직접 지정한 상대 경로는 실행 디렉터리 기준입니다. 백엔드 파일은 이동하거나 변경하지 않습니다.

보관된 JSON 보고서의 경로는 **보고서 생성 당시의 경로**입니다. 파일 내용과 해시는 보존했으며, 현재 파일은 `data_artifacts/20261110/` 아래 같은 이름의 폴더에서 찾을 수 있습니다.

- 기본 검색어: 콜라·코카콜라·펩시·큰사발·컵라면·라면·도시락·삼각·우유·바나나우유·커피·봉지라면·참치마요·제육·불고기.
- CU는 상품 목록의 신선식품 2개 메뉴, 음료, 식품을 페이지 순서대로 수집합니다.
- `--query`를 반복하면 JSON API 3사의 검색어를 교체합니다. `--max-pages 50`, `--max-requests 1200`, `--delay 1.2`, `--timeout 15`가 기본입니다. 간격은 최소 1초입니다.
- `--brands EMART24`처럼 특정 브랜드만 재수집할 수 있습니다. `--input-jsonl`을 여러 번 지정하면 각 실행의 저장 응답을 함께 통합합니다.
- 새 출력 폴더만 허용합니다. 같은 폴더로 재실행하면 거부합니다. backend의 data 폴더로 자동 복사하거나 DB에 직접 넣지 않습니다.
- 401/403/429는 재시도·우회하지 않고 해당 브랜드를 중단합니다. 5xx·네트워크 오류만 기존 HTTP 클라이언트에서 최대 2회 재시도합니다. 다른 브랜드와 이미 받은 데이터는 유지합니다.
- GS25는 2026-11-10 실측한 `startCount` 오프셋과 `listCount` 페이지 크기를 사용합니다. SEVEN은 0부터 쪽 번호, EMART24는 1부터 쪽 번호, CU는 `pageIndex`입니다. 반복 페이지·상한 도달은 partial로 기록합니다. 검색 기반이므로 전체 판매 목록의 완전성을 보장하지 않습니다.

## 출력

- `product_group.csv`: product_key,name,maker,category,size,unit,image_url
- `products.csv`: product_id,product_key,brand,source_name,list_price,event
- `sku_conflicts.csv`: 가격·행사 또는 핵심 속성 충돌. 해당 브랜드·상품의 대표 행은 보류하고 다른 정상 브랜드는 유지합니다.
- `unmapped_products.csv`: 보수적으로 분류할 수 없는 상품
- `excluded_items.csv`: 명확한 증정 전용·잘못된 가격·컬럼 길이 초과 등 제외 사유
- `normalization_changes.csv`: name_report.csv의 기존 결과와 다른 정규화 결과. 참고 파일을 바코드 기반 강제 병합표로 사용하지 않습니다.
- `collection_report.json`: 브랜드별 상태·수집·중복·오류·제외·미분류·출력 통계, 검증 결과
- `raw_responses.jsonl`: 로그인 정보 없는 공개 상품 원본 응답과 요청. 오프라인 재현용입니다.

```powershell
py -3 tools/catalog/collect_catalog.py --input-jsonl data_artifacts/catalog_run_01/raw_responses.jsonl --out-dir data_artifacts/catalog_replay_01
```

오프라인 재생도 실제 브랜드별 JSON/HTML 파서를 통과합니다. 단순 category audit CSV에는 가격·행사가 없으므로 실제 상품 수집 결과로 가장해 내보내지 않습니다.
보관된 `data_artifacts/20261110/seven_csv_output/` 및 `backend/src/main/resources/data/`의 상품명과 달라지는 사례도 `normalization_changes.csv`에 기록합니다. 비교 경로는 `--previous-csv-dir`로 교체하거나 여러 번 지정할 수 있습니다. 기존 가격·행사를 새 수집 결과로 대신 사용하지 않습니다.

## 정책과 한계

이름·용량·묶음·맛·제로 여부·라면 포장을 보존합니다. 이름이 다르면 같은 바코드라도 다른 상품으로 취급하고, 이름이 같아도 카테고리·용량이 충돌하면 내보내지 않습니다. 공장명은 도시락·삼각김밥 maker에서 제외합니다. `1ㆍ5L`는 1500ML입니다.

상품군은 COLA, MILK, COFFEE, RAMEN_CUP, RAMEN_BAG, LUNCHBOX, TRIANGLE_KIMBAP 7개입니다. 원본 분류 → 같은 정규화 이름의 교차 분류 → 보수적 이름 판별 순서입니다. 동일 바코드만으로 분류를 복사하지 않습니다.

`product_key`는 정규화 이름 SHA-256 기반이며 특정 브랜드 바코드에 종속되지 않습니다. `product_id`는 브랜드·원본 SKU·이름 식별값 기반입니다. 모든 키 충돌은 실패 처리합니다. 최종 대표 이름은 정보가 있는 이름, SEVEN → GS25 → EMART24 → CU 순입니다.

가격은 SEVEN onlinePrice, GS25 sellPrice, EMART24의 양수 originPrice(0/없음이면 viewPrice), CU의 상품 목록 가격입니다. EMART24의 음수 salePrice는 사용하지 않습니다. GS25 oneplus의 tag=1은 전체 검색 후 합쳐 1+1로 반영합니다. **GS25에서 1+1 매칭이 없으면 NONE으로 단정하지 않고 OTHER(미확인 행사)**로 두며 건수를 보고합니다. OTHER와 NONE은 구별하고 OTHER의 행사 할인은 계산하지 않습니다. CU는 상품 카드의 실제 badge만 파싱하며 HTML 주석은 행사로 인식하지 않습니다.

현재 DB·Event enum의 OTHER 지원을 함께 추가했습니다. 수집기 자체는 가격 할인을 계산하지 않습니다. 차후 quote 계산에서는 OTHER에 N+1 효과를 적용하면 안 됩니다.

UTF-8 CSV에 올바른 따옴표 escaping을 적용하고 Java 로더가 지원하지 않는 여러 줄 필드는 제외합니다. PK·FK·UNIQUE, enum, 길이·양수·size/unit 쌍을 검사하고, 실제 schema.sql의 product_group/product 테이블 제약을 SQLite에서 추가 검증합니다(H2 REGEXP_LIKE 함수만 호환 등록). 실제 H2/로더 검증은 backend Gradle 테스트에서 수행합니다.

종료 코드: 0=요청 범위 성공 또는 오프라인 재생 성공, 2=일부 브랜드 실패/페이지 제한(유효 CSV는 보존), 1=최종 검증 실패 또는 내보낼 상품 없음(보고서 보존). 비공식 검색 API의 상품·가격은 조회 시점 브랜드 표시값이며 매장별 실제 판매가·재고를 보장하지 않습니다.
