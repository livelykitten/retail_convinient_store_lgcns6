package com.lgcns.retail.store.dto;

import com.fasterxml.jackson.annotation.JsonPropertyOrder;

/** GET /api/stores 응답이자 모듈 간 DTO. walkMin은 TMAP 조회를 못 했으면 null이다. */
@JsonPropertyOrder({ "storeId", "brand", "placeName", "x", "y", "distanceM", "walkMin", "roadAddress" })
public record Store(
        String storeId,
        String brand,
        String placeName,
        double x,
        double y,
        int distanceM,
        Integer walkMin
        //String roadAddress
        ) {

    public Store withWalkMin(Integer minutes) {
        return new Store(storeId, brand, placeName, x, y, distanceM, minutes);
    }
}
