package com.lgcns.retail.quote.store;

import com.lgcns.retail.common.Brand;
import java.util.Comparator;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.stereotype.Component;

/**
 * 카카오 키가 없을 때만 쓰는 고정 매장 (테스트 · 키 없는 로컬 실행용).
 * 요청 좌표 근처에 4사 매장이 하나씩 있다고 보고 돌려준다. 어떤 좌표로 불러도 동작한다.
 * 키가 있으면 KakaoNearbyStoreSource가 대신 쓰인다.
 */
@Component
@ConditionalOnExpression("'${KAKAO_REST_API_KEY:}'.isBlank()")
public class FixedNearbyStoreSource implements NearbyStoreSource {

    // 요청 좌표에서 떨어진 정도 (경도 · 위도 차이). 대략 100 ~ 400m
    private static final List<Offset> OFFSETS = List.of(
            new Offset("fixed-cu-1", Brand.CU, "CU 예시점", 0.0010, -0.0012),
            new Offset("fixed-gs25-1", Brand.GS25, "GS25 예시점", -0.0004, 0.0015),
            new Offset("fixed-seven-1", Brand.SEVEN, "세븐일레븐 예시점", 0.0020, 0.0008),
            new Offset("fixed-emart24-1", Brand.EMART24, "이마트24 예시점", -0.0028, -0.0020));

    @Override
    public List<NearbyStore> findNearby(double x, double y, int radius) {
        return OFFSETS.stream()
                .map(o -> {
                    double sx = x + o.dx();
                    double sy = y + o.dy();
                    return new NearbyStore(o.storeId(), o.brand(), o.placeName(), sx, sy,
                            Distance.meters(x, y, sx, sy));
                })
                .filter(s -> s.distanceM() <= radius)
                .sorted(Comparator.comparingInt(NearbyStore::distanceM))
                .toList();
    }

    private record Offset(String storeId, Brand brand, String placeName, double dx, double dy) {
    }

    /** 두 좌표의 직선거리(m). 하버사인 공식 */
    static final class Distance {

        private static final double EARTH_RADIUS_M = 6_371_000;

        private Distance() {
        }

        static int meters(double x1, double y1, double x2, double y2) {
            double lat1 = Math.toRadians(y1);
            double lat2 = Math.toRadians(y2);
            double dLat = lat2 - lat1;
            double dLon = Math.toRadians(x2 - x1);
            double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
            return (int) Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(a)));
        }
    }
}
