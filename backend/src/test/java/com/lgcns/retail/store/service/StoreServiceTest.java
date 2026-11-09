package com.lgcns.retail.store.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyDouble;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.lgcns.retail.store.client.KakaoLocalClient;
import com.lgcns.retail.store.client.KakaoLocalClient.Place;
import com.lgcns.retail.store.client.TmapWalkingClient;
import com.lgcns.retail.store.dto.Store;

class StoreServiceTest {

    private static final double X = 127.05;
    private static final double Y = 37.54;

    private final KakaoLocalClient kakao = mock(KakaoLocalClient.class);
    private final TmapWalkingClient tmap = mock(TmapWalkingClient.class);
    private final StoreService service = new StoreService(kakao, tmap);

    private static Place place(String id, String name, String distance) {
        return new Place(id, name, "서울 성동구 연무장길 1", "127.0571", "37.5431", distance);
    }

    @Test
    @DisplayName("4사 시작어로 브랜드를 판별하고 그 밖의 편의점은 뺀다")
    void brand() {
        when(kakao.findConvenienceStores(X, Y, 500)).thenReturn(List.of(
                place("1", "CU 성수점", "10"),
                place("2", "GS25 성수점", "20"),
                place("3", "세븐일레븐 성수점", "30"),
                place("4", "이마트24 성수점", "40"),
                place("5", "미니스톱 성수점", "50")));

        assertThat(service.findNearby(X, Y, 500))
                .extracting(Store::brand)
                .containsExactly("CU", "GS25", "SEVEN", "EMART24");
    }

    @Test
    @DisplayName("findNearby는 TMAP을 부르지 않는다")
    void findNearbySkipsTmap() {
        when(kakao.findConvenienceStores(X, Y, 500)).thenReturn(List.of(place("1", "CU 성수점", "240")));

        Store store = service.findNearby(X, Y, 500).get(0);

        assertThat(store.walkMin()).isNull();
        verify(tmap, never()).walkingMinutes(anyDouble(), anyDouble(), anyDouble(), anyDouble());
    }

    @Test
    @DisplayName("요청 좌표에서 매장 좌표까지의 도보 시간을 채운다")
    void walkMin() {
        when(kakao.findConvenienceStores(X, Y, 500)).thenReturn(List.of(place("1", "CU 성수점", "240")));
        when(tmap.walkingMinutes(X, Y, 127.0571, 37.5431)).thenReturn(4);

        assertThat(service.findNearbyWithWalkMin(X, Y, 500))
                .containsExactly(new Store("1", "CU", "CU 성수점", 127.0571, 37.5431, 240, 4));
    }

    @Test
    @DisplayName("TMAP이 실패해도 매장 목록은 walkMin null로 돌려준다")
    void tmapFailure() {
        when(kakao.findConvenienceStores(X, Y, 500)).thenReturn(List.of(place("1", "CU 성수점", "240")));
        when(tmap.walkingMinutes(X, Y, 127.0571, 37.5431)).thenThrow(new IllegalStateException("no key"));

        assertThat(service.findNearbyWithWalkMin(X, Y, 500))
                .singleElement()
                .satisfies(store -> assertThat(store.walkMin()).isNull());
    }
}
