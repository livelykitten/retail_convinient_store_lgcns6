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
        mockMvc.perform(get("/api/products").param("category", "MILK"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.length()").value(1))
                .andExpect(jsonPath("$[0].productKey").value("binggrae-banana-240"))
                .andExpect(jsonPath("$[0].name").value("빙그레 바나나맛우유 240ml"));
    }
}
