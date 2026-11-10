package com.lgcns.retail.store.service;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;

import com.lgcns.retail.store.client.KakaoLocalClient;
import com.lgcns.retail.store.client.TmapWalkingClient;
import com.lgcns.retail.store.dto.Store;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;

@Slf4j
@Service
@RequiredArgsConstructor
public class StoreService {

    // api-spec 4-4절: place_name 시작어 → brand 값
    private static final Map<String, String> BRAND_BY_PREFIX = Map.of(
            "CU", "CU",
            "GS25", "GS25",
            "세븐일레븐", "SEVEN",
            "이마트24", "EMART24");

    private final KakaoLocalClient kakaoLocalClient;
    private final TmapWalkingClient tmapWalkingClient;

    /** 반경 안의 4사 매장을 거리순으로 반환한다. TMAP을 부르지 않으므로 walkMin은 null이다. */
    public List<Store> findNearby(double x, double y, int radius) {
        return kakaoLocalClient.findConvenienceStores(x, y, radius).stream()
                .flatMap(place -> toStore(place).stream())
                .toList();
    }

    /** findNearby 결과에 매장별 TMAP 도보 시간을 채운다. GET /api/stores 전용. */
    public List<Store> findNearbyWithWalkMin(double x, double y, int radius) {
    return nearestPerBrand(findNearby(x, y, radius)).stream()
            .map(store -> store.withWalkMin(walkMinOrNull(x, y, store)))
            .toList();
}

    // stores는 이미 거리순이라, 브랜드별로 처음 나온 매장이 가장 가깝다.
    private static List<Store> nearestPerBrand(List<Store> stores) {
        Map<String, Store> nearest = new LinkedHashMap<>();
        for (Store store : stores) {
            nearest.putIfAbsent(store.brand(), store);
        }
        return List.copyOf(nearest.values());
    }

    private Integer walkMinOrNull(double x, double y, Store store) {
        try {
            return tmapWalkingClient.walkingMinutes(x, y, store.x(), store.y());
        } catch (RuntimeException e) {
            // 도보 시간 하나 때문에 매장 목록 전체를 실패시키지 않는다.
            log.warn("TMAP 도보 시간 조회 실패 storeId={}: {}", store.storeId(), e.getMessage());
            return null;
        }
    }

    private static Optional<Store> toStore(KakaoLocalClient.Place place) {
        return BRAND_BY_PREFIX.entrySet().stream()
                .filter(entry -> place.placeName().startsWith(entry.getKey()))
                .map(Map.Entry::getValue)
                .findFirst()
                .map(brand -> new Store(
                        place.id(),
                        brand,
                        place.placeName(),
                        Double.parseDouble(place.x()),
                        Double.parseDouble(place.y()),
                        Integer.parseInt(place.distance()),
                        null
                        //place.roadAddressName()
                         ));
    }
}
