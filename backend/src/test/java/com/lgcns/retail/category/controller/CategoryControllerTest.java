package com.lgcns.retail.category.controller;

import com.lgcns.retail.category.exception.CategoryExceptionHandler;
import com.lgcns.retail.category.service.KeywordCategoryResolver;
import com.lgcns.retail.category.service.KeywordDictionary;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class CategoryControllerTest {

    private MockMvc mockMvc;

    @BeforeEach
    void setUp() {
        KeywordDictionary keywordDictionary = new KeywordDictionary();
        KeywordCategoryResolver resolver = new KeywordCategoryResolver(keywordDictionary);
        CategoryController controller = new CategoryController(resolver);

        this.mockMvc = MockMvcBuilders.standaloneSetup(controller)
                .setControllerAdvice(new CategoryExceptionHandler())
                .build();
    }

    @Test
    @DisplayName("GET /api/categories/resolve?q=우유 명세 v1.1 메인 샘플 요청 시 query, MILK 카테고리와 200 반환")
    void resolveMilkSuccessfully() throws Exception {
        mockMvc.perform(get("/api/categories/resolve").param("q", "우유"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.query").value("우유"))
                .andExpect(jsonPath("$.category").value("MILK"))
                .andExpect(jsonPath("$.confidence").value(1.0))
                .andExpect(jsonPath("$.method").value("KEYWORD"));
    }

    @Test
    @DisplayName("GET /api/categories/resolve?q=콜라 정상 요청 시 query, COLA 카테고리와 200 반환")
    void resolveColaSuccessfully() throws Exception {
        mockMvc.perform(get("/api/categories/resolve").param("q", "콜라"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.query").value("콜라"))
                .andExpect(jsonPath("$.category").value("COLA"))
                .andExpect(jsonPath("$.confidence").value(1.0))
                .andExpect(jsonPath("$.method").value("KEYWORD"));
    }

    @Test
    @DisplayName("q 파라미터가 비어있으면 400 INVALID_PARAM 반환")
    void resolveEmptyQueryFails() throws Exception {
        mockMvc.perform(get("/api/categories/resolve").param("q", ""))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PARAM"));
    }

    @Test
    @DisplayName("q 파라미터가 30자를 초과하면 400 INVALID_PARAM 반환")
    void resolveOverLengthQueryFails() throws Exception {
        String longQuery = "a".repeat(31);
        mockMvc.perform(get("/api/categories/resolve").param("q", longQuery))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PARAM"));
    }
}

