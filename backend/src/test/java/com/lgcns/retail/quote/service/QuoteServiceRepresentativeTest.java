package com.lgcns.retail.quote.service;

import static org.assertj.core.api.Assertions.assertThat;

import com.lgcns.retail.common.Brand;
import com.lgcns.retail.product.entity.Event;
import com.lgcns.retail.quote.dto.QuoteResponse.StoreQuote;
import com.lgcns.retail.quote.dto.StockStatus;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** 상품 한 줄의 event · listPrice · minUnitPrice를 정하는 대표 매장 (결정 2026-11-10) */
class QuoteServiceRepresentativeTest {

    @Test
    @DisplayName("미확인 행사 OTHER 코드를 유지하고 행사 배지는 표시하지 않는다")
    void otherHasNoPromotionLabel() {
        StoreQuote quote = store("gs25", Brand.GS25, 36, Event.OTHER, 2000, StockStatus.IN_STOCK);

        assertThat(quote.event()).isEqualTo(Event.OTHER);
        assertThat(quote.eventLabel()).isNull();
    }

    private static StoreQuote store(String id, Brand brand, int distanceM, Event event, int unitPrice,
                                    StockStatus stock) {
        return new StoreQuote(id, brand, id, 127.0, 37.5, distanceM, QuoteService.walkMin(distanceM),
                event, QuoteService.eventLabel(event), unitPrice, List.of(), stock);
    }

    @Test
    @DisplayName("통합 테스트의 김밥 예: 세븐(900원)이 OUT이면 재고 있는 CU(1,700원)가 대표")
    void skipsOutOfStock() {
        List<StoreQuote> stores = List.of(
                store("cu", Brand.CU, 117, Event.NONE, 1700, StockStatus.IN_STOCK),
                store("gs25", Brand.GS25, 36, Event.NONE, 1800, StockStatus.IN_STOCK),
                store("seven", Brand.SEVEN, 166, Event.ONE_PLUS_ONE, 900, StockStatus.OUT));

        StoreQuote picked = QuoteService.representative(stores);

        assertThat(picked.storeId()).isEqualTo("cu");
        assertThat(picked.event()).isEqualTo(Event.NONE);
        assertThat(picked.unitPrice()).isEqualTo(1700);
    }

    @Test
    @DisplayName("LOW는 재고가 있는 것으로 본다")
    void lowCounts() {
        List<StoreQuote> stores = List.of(
                store("cu", Brand.CU, 100, Event.NONE, 1700, StockStatus.IN_STOCK),
                store("emart24", Brand.EMART24, 300, Event.ONE_PLUS_ONE, 1000, StockStatus.LOW));

        assertThat(QuoteService.representative(stores).storeId()).isEqualTo("emart24");
    }

    @Test
    @DisplayName("값이 같으면 가까운 매장")
    void tieBreaksByDistance() {
        List<StoreQuote> stores = List.of(
                store("cu", Brand.CU, 117, Event.ONE_PLUS_ONE, 1250, StockStatus.IN_STOCK),
                store("gs25", Brand.GS25, 36, Event.ONE_PLUS_ONE, 1250, StockStatus.LOW));

        assertThat(QuoteService.representative(stores).storeId()).isEqualTo("gs25");
    }

    @Test
    @DisplayName("모두 OUT이면 OUT 매장 중 가장 싼 곳")
    void allOut() {
        List<StoreQuote> stores = List.of(
                store("cu", Brand.CU, 117, Event.NONE, 1700, StockStatus.OUT),
                store("seven", Brand.SEVEN, 166, Event.ONE_PLUS_ONE, 900, StockStatus.OUT));

        assertThat(QuoteService.representative(stores).storeId()).isEqualTo("seven");
    }
}
