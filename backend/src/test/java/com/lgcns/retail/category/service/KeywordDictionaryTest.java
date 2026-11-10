package com.lgcns.retail.category.service;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;

class KeywordDictionaryTest {

    private final KeywordDictionary dictionary = new KeywordDictionary();

    @ParameterizedTest(name = "{0} → {1}")
    @CsvSource({
            "사이다, SODA",
            "환타, SODA",
            "웰치스, SODA",
            "탄산음료, SODA",
            "콜라 탄산, COLA",
            "칠성사이다, SODA",
            "스프라이트, SODA",
            "초콜릿, CHOCOLATE",
            "초코, CHOCOLATE",
            "가나초콜릿, CHOCOLATE",
            "초코우유, MILK",
            "초코파이, SNACK",
            "콘칩, SNACK",
            "카스테라, SNACK",
            "카스, BEER",
            "컵라면, RAMEN",
            "팔도도시락, RAMEN",
            "삼각김밥, LUNCHBOX",
            "월드콘, ICECREAM",
            "카페라떼, COFFEE"
    })
    @DisplayName("erd.md 상품군 목록으로 분류하고, 더 긴 키워드가 이긴다")
    void resolvesToAgreedCategories(String query, String expected) {
        assertThat(dictionary.findCategory(query)).contains(expected);
    }

    @ParameterizedTest
    @ValueSource(strings = {"코", "라", "바", "콜라겐", "쇼콜라", "노트북"})
    @DisplayName("검색어가 키워드의 일부일 뿐이거나 제외어면 분류하지 않는다")
    void doesNotMatchFragmentsOrExcludedWords(String query) {
        assertThat(dictionary.findCategory(query)).isEmpty();
    }
}
