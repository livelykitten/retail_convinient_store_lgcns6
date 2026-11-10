package com.lgcns.retail.quote.service;

import com.lgcns.retail.quote.dto.StockStatus;

/**
 * 재고 예시값 (API명세최종.md 5-3). 저장하지 않고 요청마다 같은 규칙으로 계산한다.
 * 역할 분담상 StockService.statusOf(노건우) 몫이라, store 모듈에 생기면 그쪽으로 옮긴다 (확인 요망).
 */
public final class StockStatusCalculator {

    private StockStatusCalculator() {
    }

    /** storeId + ":" + productKey 문자열 해시를 10으로 나눈 나머지(음수면 양수로): 0~5 있음, 6~8 적음, 9 없음 */
    public static StockStatus statusOf(String storeId, String productKey) {
        int n = Math.floorMod((storeId + ":" + productKey).hashCode(), 10);
        if (n <= 5) {
            return StockStatus.IN_STOCK;
        }
        if (n <= 8) {
            return StockStatus.LOW;
        }
        return StockStatus.OUT;
    }
}
