package com.lgcns.retail.quote.store;

import java.util.List;

/**
 * quotes가 매장을 받아 오는 곳. 반경 안의 4사 매장을 거리순으로 돌려준다.
 * 실제 구현은 노건우 님 store 모듈의 StoreService.findNearby (feat/FR-03-kakao-stores, 병합 전).
 * 병합되면 그 서비스를 부르는 구현으로 바꾸고 FixedNearbyStoreSource는 지운다.
 * 카카오 429 · 그 밖 오류는 BusinessException(KAKAO_RATE_LIMIT · KAKAO_ERROR)으로 던진다.
 */
public interface NearbyStoreSource {

    List<NearbyStore> findNearby(double x, double y, int radius);
}
