package com.lgcns.retail.category.service;

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
        // 우유 / 유제품 (API 명세 4-2 메인 샘플: '우유', '바나나우유', '빙그레 바나나맛우유')
        categoryKeywords.put("MILK", Arrays.asList(
                "우유", "바나나우유", "바나나맛우유", "초코우유", "딸기우유", "흰우유", "저지방우유",
                "빙그레", "서울우유", "매일우유", "milk", "banana milk"
        ));

        // 커피 / 음료 (API 명세 4-2 샘플: '매일 바리스타룰스 카페라떼')
        categoryKeywords.put("COFFEE", Arrays.asList(
                "커피", "카페라떼", "바리스타", "바리스타룰스", "아메리카노", "라떼", "에스프레소", "콜드브루",
                "칸타타", "TOP", "조지아", "레쓰비", "맥심", "coffee", "latte"
        ));

        // 탄산음료 / 콜라
        categoryKeywords.put("COLA", Arrays.asList(
                "콜라", "코카콜라", "코카-콜라", "코카 콜라", "펩시", "제로콜라", "제로 콜라", "펩시제로",
                "사이다", "칠성사이다", "스프라이트", "환타", "웰치스", "탄산음료", "탄산",
                "cola", "coca", "pepsi", "coke", "soda"
        ));

        // 라면
        categoryKeywords.put("RAMEN", Arrays.asList(
                "라면", "컵라면", "봉지라면", "신라면", "진라면", "불닭", "불닭볶음면", "짜파게티", "삼양라면",
                "너구리", "안성탕면", "육개장", "비빔면", "ramen", "noodle"
        ));

        // 스낵 / 과자
        categoryKeywords.put("SNACK", Arrays.asList(
                "과자", "스낵", "포테토칩", "포카칩", "새우깡", "빼빼로", "초코파이", "꼬북칩", "홈런볼",
                "snack", "chip", "cookie"
        ));

        // 간편식 / 도시락 / 김밥
        categoryKeywords.put("LUNCHBOX", Arrays.asList(
                "도시락", "김밥", "삼각김밥", "샌드위치", "햄버거", "주먹밥",
                "lunchbox", "bento", "gimbap", "sandwich", "burger"
        ));

        // 아이스크림
        categoryKeywords.put("ICECREAM", Arrays.asList(
                "아이스크림", "하드", "콘", "빙수", "메로나", "월드콘", "누가바", "돼지바", "구레잇",
                "icecream"
        ));

        // 주류 / 맥주
        categoryKeywords.put("BEER", Arrays.asList(
                "맥주", "소주", "하이볼", "카스", "테라", "켈리", "참이슬", "처음처럼",
                "beer", "soju"
        ));
    }

    /**
     * 질의어(query)로 카테고리를 찾습니다.
     */
    public Optional<String> findCategory(String query) {
        if (query == null) {
            return Optional.empty();
        }

        String normalized = query.trim().toLowerCase().replaceAll("\\s+", "");
        if (normalized.isEmpty()) {
            return Optional.empty();
        }

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

