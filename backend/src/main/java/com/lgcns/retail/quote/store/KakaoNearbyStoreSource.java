package com.lgcns.retail.quote.store;

import com.lgcns.retail.common.Brand;
import com.lgcns.retail.store.service.StoreService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.stereotype.Component;

/**
 * 카카오 키가 있으면 노건우 님 StoreService로 반경 안 4사 매장을 거리순으로 받는다.
 * 카카오 오류(KakaoRateLimitException · KakaoApiException)는 이미 BusinessException이라 그대로 올려 보낸다
 * → 429 KAKAO_RATE_LIMIT · 502 KAKAO_ERROR (API명세최종.md 2절)
 */
@Component
@RequiredArgsConstructor
@ConditionalOnExpression("!'${KAKAO_REST_API_KEY:}'.isBlank()")
public class KakaoNearbyStoreSource implements NearbyStoreSource {

    private final StoreService storeService;

    @Override
    public List<NearbyStore> findNearby(double x, double y, int radius) {
        return storeService.findNearby(x, y, radius).stream()
                .map(s -> new NearbyStore(s.storeId(), Brand.valueOf(s.brand()), s.placeName(),
                        s.x(), s.y(), s.distanceM()))
                .toList();
    }
}
