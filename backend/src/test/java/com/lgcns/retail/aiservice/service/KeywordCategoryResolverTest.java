package com.lgcns.retail.aiservice.service;

import com.lgcns.retail.aiservice.dto.CategoryResolveResponse;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import static org.assertj.core.api.Assertions.assertThat;

class KeywordCategoryResolverTest {

    private final KeywordDictionary keywordDictionary = new KeywordDictionary();
    private final KeywordCategoryResolver resolver = new KeywordCategoryResolver(keywordDictionary);

    @ParameterizedTest
    @ValueSource(strings = {"콜라", "코카콜라", "펩시", "제로콜라", "coca", "pepsi"})
    @DisplayName("콜라 관련 키워드는 COLA 카테고리로 해결된다")
    void resolveColaKeywords(String query) {
        CategoryResolveResponse response = resolver.resolve(query);

        assertThat(response.getCategory()).isEqualTo("COLA");
        assertThat(response.getConfidence()).isEqualTo(1.0);
        assertThat(response.getMethod()).isEqualTo("KEYWORD");
    }

    @ParameterizedTest
    @ValueSource(strings = {"라면", "신라면", "진라면", "불닭볶음면"})
    @DisplayName("라면 관련 키워드는 RAMEN 카테고리로 해결된다")
    void resolveRamenKeywords(String query) {
        CategoryResolveResponse response = resolver.resolve(query);

        assertThat(response.getCategory()).isEqualTo("RAMEN");
        assertThat(response.getConfidence()).isEqualTo(1.0);
        assertThat(response.getMethod()).isEqualTo("KEYWORD");
    }

    @Test
    @DisplayName("사전에 없는 키워드는 category null, confidence 0.0을 반환한다")
    void resolveUnknownKeywords() {
        CategoryResolveResponse response = resolver.resolve("알수없는검색어123");

        assertThat(response.getCategory()).isNull();
        assertThat(response.getConfidence()).isEqualTo(0.0);
        assertThat(response.getMethod()).isEqualTo("KEYWORD");
    }
}

