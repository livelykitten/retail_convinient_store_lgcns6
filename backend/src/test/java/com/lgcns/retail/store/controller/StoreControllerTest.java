package com.lgcns.retail.store.controller;

import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import com.lgcns.retail.store.client.KakaoRateLimitException;
import com.lgcns.retail.store.dto.Store;
import com.lgcns.retail.store.service.StoreService;

@WebMvcTest(StoreController.class)
class StoreControllerTest {

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private StoreService storeService;

    @Test
    @DisplayName("요청한 좌표의 매장을 명세 필드로 돌려준다")
    void response() throws Exception {
        when(storeService.findNearbyWithWalkMin(127.05, 37.54, 500)).thenReturn(List.of(
                new Store("12345678", "CU", "CU 성수연무장점", 127.0571, 37.5431, 240, 4)));

        mockMvc.perform(get("/api/stores").param("x", "127.05").param("y", "37.54"))
                .andExpect(status().isOk())
                .andExpect(content().string(
                        "[{\"storeId\":\"12345678\",\"brand\":\"CU\",\"placeName\":\"CU 성수연무장점\","
                                + "\"x\":127.0571,\"y\":37.5431,\"distanceM\":240,\"walkMin\":4}]"));
    }

    @Test
    @DisplayName("x가 없으면 400")
    void missingX() throws Exception {
        mockMvc.perform(get("/api/stores").param("y", "37.54"))
                .andExpect(status().isBadRequest());
    }

    @Test
    @DisplayName("radius가 2000을 넘으면 카카오를 부르지 않고 400 INVALID_PARAM")
    void radiusTooLarge() throws Exception {
        mockMvc.perform(get("/api/stores").param("x", "127.05").param("y", "37.54").param("radius", "2001"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PARAM"));
        verify(storeService, never()).findNearbyWithWalkMin(anyDouble(), anyDouble(), anyInt());
    }

    @Test
    @DisplayName("radius 2000은 최대값이라 허용한다")
    void radiusMax() throws Exception {
        when(storeService.findNearbyWithWalkMin(127.05, 37.54, 2000)).thenReturn(List.of());

        mockMvc.perform(get("/api/stores").param("x", "127.05").param("y", "37.54").param("radius", "2000"))
                .andExpect(status().isOk());
    }

    @Test
    @DisplayName("radius가 1보다 작으면 400 INVALID_PARAM")
    void radiusTooSmall() throws Exception {
        mockMvc.perform(get("/api/stores").param("x", "127.05").param("y", "37.54").param("radius", "0"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PARAM"));
    }

    @Test
    @DisplayName("카카오 429는 HTTP 429로 나간다")
    void rateLimit() throws Exception {
        when(storeService.findNearbyWithWalkMin(127.05, 37.54, 500)).thenThrow(new KakaoRateLimitException());

        mockMvc.perform(get("/api/stores").param("x", "127.05").param("y", "37.54"))
                .andExpect(status().isTooManyRequests());
    }
}
