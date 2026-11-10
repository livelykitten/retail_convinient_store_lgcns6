package com.lgcns.retail.category.service;

import org.springframework.stereotype.Component;

import java.util.*;

/**
 * 검색어 → 상품군 키워드 사전 (FR-02).
 * 상품군 이름은 docs/reference/erd.md 3-1의 목록과 같아야 한다. 다르면 quotes에서 상품을 못 찾는다.
 */
@Component
public class KeywordDictionary {

    // 카테고리별 매핑 키워드 목록. 같은 길이로 맞으면 먼저 적힌 상품군이 이긴다
    private final Map<String, List<String>> categoryKeywords = new LinkedHashMap<>();

    // 이 말이 들어 있으면 그 상품군으로 보지 않는다 (예: "콜라겐"은 콜라가 아님)
    private final Map<String, List<String>> excludedWords = new HashMap<>();

    public KeywordDictionary() {
        initKeywords();
    }

    private void initKeywords() {
        // 우유 / 유제품
        categoryKeywords.put("MILK", Arrays.asList(
                "우유", "바나나우유", "바나나맛우유", "초코우유", "딸기우유", "흰우유", "저지방우유",
                "서울우유", "매일우유", "milk", "banana milk"));

        // 커피
        categoryKeywords.put("COFFEE", Arrays.asList(
                "커피", "카페라떼", "바리스타", "바리스타룰스", "아메리카노", "라떼", "에스프레소", "콜드브루",
                "칸타타", "티오피", "조지아", "레쓰비", "맥심", "coffee", "latte"));

        // 콜라 · 탄산음료 (사이다는 CIDER)
        categoryKeywords.put("COLA", Arrays.asList(
                "콜라", "코카콜라", "코카-콜라", "코카 콜라", "펩시", "제로콜라", "제로 콜라", "펩시제로",
                "환타", "웰치스", "탄산음료", "탄산",
                "cola", "coca", "pepsi", "coke", "soda"));
        excludedWords.put("COLA", List.of("콜라겐", "쇼콜라", "니콜라", "리콜라"));

        // 사이다
        categoryKeywords.put("CIDER", Arrays.asList(
                "사이다", "칠성사이다", "스프라이트", "cider", "sprite"));

        // 라면
        categoryKeywords.put("RAMEN", Arrays.asList(
                "라면", "컵라면", "봉지라면", "신라면", "진라면", "불닭", "불닭볶음면", "짜파게티", "삼양라면",
                "너구리", "안성탕면", "육개장", "비빔면", "큰사발", "팔도도시락", "ramen", "noodle"));

        // 초콜릿
        categoryKeywords.put("CHOCOLATE", Arrays.asList(
                "초콜릿", "초콜렛", "초코", "가나초콜릿", "킨더", "허쉬", "킷캣", "페레로로쉐", "엠앤엠즈",
                "chocolate", "choco"));

        // 스낵 / 과자
        categoryKeywords.put("SNACK", Arrays.asList(
                "과자", "스낵", "포테토칩", "포카칩", "감자칩", "콘칩", "새우깡", "빼빼로", "초코파이", "꼬북칩",
                "홈런볼", "카스테라", "snack", "chip", "cookie"));

        // 간편식 / 도시락 / 김밥
        categoryKeywords.put("LUNCHBOX", Arrays.asList(
                "도시락", "김밥", "삼각김밥", "샌드위치", "햄버거", "주먹밥",
                "lunchbox", "bento", "gimbap", "sandwich", "burger"));

        // 아이스크림
        categoryKeywords.put("ICECREAM", Arrays.asList(
                "아이스크림", "하드", "빙수", "메로나", "월드콘", "구구콘", "누가바", "돼지바", "구구크러스터",
                "icecream", "ice cream"));

        // 주류 / 맥주
        categoryKeywords.put("BEER", Arrays.asList(
                "맥주", "소주", "하이볼", "카스", "테라", "켈리", "참이슬", "처음처럼",
                "beer", "soju"));
    }

    /**
     * 검색어 안에 들어 있는 키워드 중 가장 긴 것의 상품군을 돌려준다.
     * "초코우유"는 "초코"(CHOCOLATE)보다 긴 "초코우유"(MILK)가 이긴다.
     * 검색어가 키워드의 일부일 뿐인 경우("코" ⊂ "코카콜라")는 맞는 것으로 보지 않는다.
     */
    public Optional<String> findCategory(String query) {
        if (query == null) {
            return Optional.empty();
        }

        String normalized = normalize(query);
        if (normalized.isEmpty()) {
            return Optional.empty();
        }

        String bestCategory = null;
        int bestLength = 0;

        for (Map.Entry<String, List<String>> entry : categoryKeywords.entrySet()) {
            String category = entry.getKey();
            if (isExcluded(category, normalized)) {
                continue;
            }
            for (String kw : entry.getValue()) {
                String normalizedKw = normalize(kw);
                if (normalized.contains(normalizedKw) && normalizedKw.length() > bestLength) {
                    bestCategory = category;
                    bestLength = normalizedKw.length();
                }
            }
        }

        return Optional.ofNullable(bestCategory);
    }

    /** 사전에 있는 상품군인지 (AI 응답 검증용) */
    public boolean isKnownCategory(String category) {
        return category != null && categoryKeywords.containsKey(category);
    }

    public Map<String, List<String>> getAllKeywords() {
        return Collections.unmodifiableMap(categoryKeywords);
    }

    private boolean isExcluded(String category, String normalizedQuery) {
        return excludedWords.getOrDefault(category, List.of()).stream()
                .anyMatch(word -> normalizedQuery.contains(normalize(word)));
    }

    private static String normalize(String text) {
        return text.trim().toLowerCase().replaceAll("\\s+", "");
    }
}
