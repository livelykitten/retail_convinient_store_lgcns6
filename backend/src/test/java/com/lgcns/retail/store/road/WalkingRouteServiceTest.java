package com.lgcns.retail.store.road;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class WalkingRouteServiceTest {

    @Test
    @DisplayName("출발지와 도착지가 2000m를 넘으면 카카오를 부르지 않고 RouteTooFarException")
    void tooFarSkipsKakao() {
        KakaoWalkingClient client = mock(KakaoWalkingClient.class);
        WalkingRouteService service = new WalkingRouteService(client);

        // 서울 → 부산
        assertThatThrownBy(() -> service.findRoute(127.016172403292, 37.563267007576314, 129.0756, 35.1796))
                .isInstanceOf(RouteTooFarException.class);
        verifyNoInteractions(client);
    }
}
