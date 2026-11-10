package com.lgcns.retail.quote.store;

import com.lgcns.retail.common.Brand;

/** quotes가 쓰는 매장 정보. storeId · placeName · x · y는 카카오 응답의 id · place_name · x · y */
public record NearbyStore(String storeId, Brand brand, String placeName, double x, double y, int distanceM) {
}
