package com.lgcns.retail.store.road;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.lgcns.retail.store.client.KakaoApiException;
import com.lgcns.retail.store.client.KakaoRateLimitException;

@WebMvcTest(WalkingRouteController.class)
class WalkingRouteControllerTest {

    private static final double START_X = 127.0563;
    private static final double START_Y = 37.5446;
    private static final double END_X = 127.0571;
    private static final double END_Y = 37.5431;

    @Autowired
    private MockMvc mockMvc;

    @MockitoBean
    private WalkingRouteService walkingRouteService;

    private static MockHttpServletRequestBuilder route(String startX) {
        return get("/api/routes/walking")
                .param("startX", startX)
                .param("startY", String.valueOf(START_Y))
                .param("endX", String.valueOf(END_X))
                .param("endY", String.valueOf(END_Y));
    }

    @Test
    @DisplayName("좌표가 빠지면 400 INVALID_PARAM")
    void missingParam() throws Exception {
        mockMvc.perform(get("/api/routes/walking").param("startY", "37.5"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PARAM"));
    }

    @Test
    @DisplayName("경도가 범위를 벗어나면 400 INVALID_PARAM")
    void outOfRange() throws Exception {
        mockMvc.perform(route("999"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PARAM"));
    }

    @Test
    @DisplayName("2000m를 넘으면 400 INVALID_PARAM")
    void tooFar() throws Exception {
        when(walkingRouteService.findRoute(START_X, START_Y, END_X, END_Y)).thenThrow(new RouteTooFarException());

        mockMvc.perform(route(String.valueOf(START_X)))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.code").value("INVALID_PARAM"));
    }

    @Test
    @DisplayName("경로가 없으면 404 ROUTE_NOT_FOUND")
    void routeNotFound() throws Exception {
        when(walkingRouteService.findRoute(START_X, START_Y, END_X, END_Y)).thenThrow(new RouteNotFoundException());

        mockMvc.perform(route(String.valueOf(START_X)))
                .andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("ROUTE_NOT_FOUND"))
                .andExpect(jsonPath("$.message").value("도보 경로를 찾지 못했어요"));
    }

    @Test
    @DisplayName("카카오 429는 429 KAKAO_RATE_LIMIT")
    void rateLimit() throws Exception {
        when(walkingRouteService.findRoute(START_X, START_Y, END_X, END_Y)).thenThrow(new KakaoRateLimitException());

        mockMvc.perform(route(String.valueOf(START_X)))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("KAKAO_RATE_LIMIT"))
                .andExpect(jsonPath("$.message").value("잠시 뒤 다시 시도해 주세요"));
    }

    @Test
    @DisplayName("그 밖의 카카오 오류는 502 KAKAO_ERROR")
    void kakaoError() throws Exception {
        when(walkingRouteService.findRoute(START_X, START_Y, END_X, END_Y))
                .thenThrow(new KakaoApiException("도보 경로를 불러오지 못했어요"));

        mockMvc.perform(route(String.valueOf(START_X)))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.code").value("KAKAO_ERROR"))
                .andExpect(jsonPath("$.message").value("도보 경로를 불러오지 못했어요"));
    }
}
