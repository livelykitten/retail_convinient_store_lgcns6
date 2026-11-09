package com.lgcns.retail.aiservice.service;

import org.springframework.stereotype.Component;

import java.util.*;

@Component
public class KeywordDictionary {

    // 카테고리별 매핑 키워드 목록
    private final Map<String, List<String>> categoryKeywords = new LinkedHashMap<>();

    public KeywordDictionary() {
        initKeywords();
    }

    private void initKeywords() {
        // 음료 / 콜라
        categoryKeywords.put("COLA", Arrays.asList(
                "콜라", "코카콜라", "펩시", "제로콜라", "제로 콜라", "코카-콜라", "코카 콜라",
                "cola", "coca", "pepsi", "coke"
        ));

        // 라면
        categoryKeywords.put("RAMEN", Arrays.asList(
                "라면", "컵라면", "봉지라면", "신라면", "진라면", "불닭", "짜파게티", "삼양라면",
                "너구리", "안성탕면", "육개장", "ramen", "noodle"
        ));

        // 과자 / 스낵
        categoryKeywords.put("SNACK", Arrays.asList(
                "과자", "스낵", "포테토칩", "포카칩", "새우깡", "빼빼로", "초코파이", "snack", "chip"
        ));

        // 도시락 / 간편식
        categoryKeywords.put("LUNCHBOX", Arrays.asList(
                "도시락", "김밥", "삼각김밥", "샌드위치", "햄버거", "bento", "gimbap", "sandwich"
        ));

        // 커피 / 차
        categoryKeywords.put("COFFEE", Arrays.asList(
                "커피", "아메리카노", "라떼", "카페라떼", "에스프레소", "coffee", "latte"
        ));

        // 아이스크림
        categoryKeywords.put("ICECREAM", Arrays.asList(
                "아이스크림", "하드", "콘", "빙수", "icecream"
        ));

        // 유제품 / 우유
        categoryKeywords.put("DAIRY", Arrays.asList(
                "우유", "요거트", "요구르트", "치즈", "milk", "yogurt"
        ));

        // 주류 / 맥주
        categoryKeywords.put("BEER", Arrays.asList(
                "맥주", "소주", "하이볼", "beer", "soju"
        ));
    }

    /**
     * 정규화된 키워드로 카테고리를 찾습니다.
     * 1. 완전 일치 또는 포함 여부 확인
     * 2. 더 구체적인 키워드가 우선 매칭되도록 긴 키워드 순서 등으로 검사
     */
    public Optional<String> findCategory(String query) {
        if (query == null) {
            return Optional.empty();
        }

        String normalized = query.trim().toLowerCase().replaceAll("\\s+", "");
        if (normalized.isEmpty()) {
            return Optional.empty();
        }

        // 1. 단어 일치 또는 포함 매칭
        for (Map.Entry<String, List<String>> entry : categoryKeywords.entrySet()) {
            String category = entry.getKey();
            List<String> keywords = entry.getValue();

            for (String kw : keywords) {
                String normalizedKw = kw.toLowerCase().replaceAll("\\s+", "");
                if (normalized.equals(normalizedKw) || normalized.contains(normalizedKw) || normalizedKw.contains(normalized)) {
                    return Optional.of(category);
                }
            }
        }

        return Optional.empty();
    }

    public Map<String, List<String>> getAllKeywords() {
        return Collections.unmodifiableMap(categoryKeywords);
    }
}

