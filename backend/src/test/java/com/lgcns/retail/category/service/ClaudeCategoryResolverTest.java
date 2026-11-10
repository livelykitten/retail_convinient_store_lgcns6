package com.lgcns.retail.category.service;

import com.lgcns.retail.category.dto.CategoryResolveResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class ClaudeCategoryResolverTest {

    private ClaudeCategoryResolver claudeCategoryResolver;
    private KeywordCategoryResolver keywordCategoryResolver;

    @BeforeEach
    void setUp() {
        KeywordDictionary keywordDictionary = new KeywordDictionary();
        keywordCategoryResolver = new KeywordCategoryResolver(keywordDictionary);

        claudeCategoryResolver = new ClaudeCategoryResolver(
                "",
                "https://api.anthropic.com/v1/messages",
                "claude-opus-5-5",
                keywordCategoryResolver,
                keywordDictionary
        );
    }

    @Test
    @DisplayName("API Key가 미설정된 경우 키워드 사전으로 안전하게 Fallback되며 query가 포함된다")
    void fallbackToKeywordWhenKeyMissing() {
        CategoryResolveResponse response = claudeCategoryResolver.resolve("콜라");

        assertThat(response).isNotNull();
        assertThat(response.getQuery()).isEqualTo("콜라");
        assertThat(response.getCategory()).isEqualTo("COLA");
        assertThat(response.getMethod()).isEqualTo("KEYWORD");
        assertThat(response.getConfidence()).isEqualTo(1.0);
    }

    @Test
    @DisplayName("같은 검색어를 다시 조회하면 캐시에서 반환된다")
    void cacheHitForSameQuery() {
        CategoryResolveResponse first = claudeCategoryResolver.resolve("신라면");
        CategoryResolveResponse second = claudeCategoryResolver.resolve("신라면");

        assertThat(first).isNotNull();
        assertThat(second).isNotNull();
        assertThat(first.getQuery()).isEqualTo(second.getQuery());
        assertThat(first.getCategory()).isEqualTo(second.getCategory());
        assertThat(first.getMethod()).isEqualTo(second.getMethod());
    }
}

