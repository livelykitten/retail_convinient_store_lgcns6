package com.lgcns.retail.aiservice.controller;

import com.lgcns.retail.aiservice.exception.AiServiceExceptionHandler;
import com.lgcns.retail.aiservice.service.KeywordCategoryResolver;
import com.lgcns.retail.aiservice.service.KeywordDictionary;
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
                .setControllerAdvice(new AiServiceExceptionHandler())
                .build();
    }

    @Test
    @DisplayName("GET /api/categories/resolve?q=콜라 정상 요청 시 COLA 카테고리와 200 반환")
    void resolveColaSuccessfully() throws Exception {
        mockMvc.perform(get("/api/categories/resolve").param("q", "콜라"))
                .andExpect(status().isOk())
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
