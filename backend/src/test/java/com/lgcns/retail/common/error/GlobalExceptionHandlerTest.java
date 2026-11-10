package com.lgcns.retail.common.error;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class GlobalExceptionHandlerTest {

    @Autowired
    private MockMvc mockMvc;

    @Test
    @DisplayName("없는 경로는 API명세최종.md대로 500 INTERNAL, 형식은 {code, message}")
    void unknownPathIsInternal() throws Exception {
        mockMvc.perform(get("/api/no-such-path"))
                .andExpect(status().isInternalServerError())
                .andExpect(jsonPath("$.code").value("INTERNAL"))
                .andExpect(jsonPath("$.message").value("서버 오류가 발생했습니다"));
    }

    @Test
    @DisplayName("상품군으로 찾으면 그 상품군의 브랜드별 상품만 온다")
    void productsByCategory() throws Exception {
        // 상품 CSV(실데이터)는 계속 바뀌므로 특정 상품 대신 "있고, 모두 MILK"인지만 본다
        mockMvc.perform(get("/api/products").param("category", "MILK"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(org.hamcrest.Matchers.greaterThan(0)))
                .andExpect(jsonPath("$[*].category").value(org.hamcrest.Matchers.everyItem(
                        org.hamcrest.Matchers.is("MILK"))));
    }
}
