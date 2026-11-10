package com.lgcns.retail.quote.store;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.lgcns.retail.common.Brand;
import com.lgcns.retail.common.error.BusinessException;
import com.lgcns.retail.common.error.ErrorCode;
import com.lgcns.retail.store.client.KakaoApiException;
import com.lgcns.retail.store.client.KakaoRateLimitException;
import com.lgcns.retail.store.dto.Store;
import com.lgcns.retail.store.service.StoreService;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class KakaoNearbyStoreSourceTest {

    private final StoreService storeService = mock(StoreService.class);
    private final KakaoNearbyStoreSource source = new KakaoNearbyStoreSource(storeService);

    @Test
    @DisplayName("StoreService의 Store를 거리순 그대로 NearbyStore로 바꾼다 (brand 문자열 → Brand)")
    void mapsStores() {
        when(storeService.findNearby(127.0, 37.5, 500)).thenReturn(List.of(
                new Store("123", "SEVEN", "세븐일레븐 신당점", 127.001, 37.501, 140, null),
                new Store("456", "EMART24", "이마트24 신당역점", 127.002, 37.502, 260, null)));

        assertThat(source.findNearby(127.0, 37.5, 500)).containsExactly(
                new NearbyStore("123", Brand.SEVEN, "세븐일레븐 신당점", 127.001, 37.501, 140),
                new NearbyStore("456", Brand.EMART24, "이마트24 신당역점", 127.002, 37.502, 260));
    }

    @Test
    @DisplayName("카카오 오류는 바꾸지 않고 그대로 올라간다: 429 KAKAO_RATE_LIMIT, 그 밖 KAKAO_ERROR")
    void passesKakaoErrorsThrough() {
        when(storeService.findNearby(1, 1, 500)).thenThrow(new KakaoRateLimitException());
        when(storeService.findNearby(2, 2, 500)).thenThrow(new KakaoApiException("매장 정보를 불러오지 못했어요"));

        assertThatThrownBy(() -> source.findNearby(1, 1, 500))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.KAKAO_RATE_LIMIT);
        assertThatThrownBy(() -> source.findNearby(2, 2, 500))
                .isInstanceOf(BusinessException.class)
                .extracting(e -> ((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.KAKAO_ERROR);
    }
}
