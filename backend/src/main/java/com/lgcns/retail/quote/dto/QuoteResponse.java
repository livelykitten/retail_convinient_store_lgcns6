package com.lgcns.retail.quote.dto;

import com.lgcns.retail.common.Brand;
import com.lgcns.retail.discount.dto.MethodRef;
import com.lgcns.retail.product.entity.Event;
import java.util.List;

/** POST /api/quotes 응답 (API명세최종.md 4-2). 필드 이름은 명세 그대로 */
public record QuoteResponse(String query, List<ProductQuote> products) {

    public record ProductQuote(
            String productKey,
            String name,
            String imageUrl,
            Event event,
            int listPrice,
            int minUnitPrice,
            int storeCount,
            List<StoreQuote> stores
    ) {
    }

    public record StoreQuote(
            String storeId,
            Brand brand,
            String placeName,
            double x,
            double y,
            int distanceM,
            int walkMin,
            Event event,
            String eventLabel,
            int unitPrice,
            List<MethodRef> applicableMethods,
            StockStatus stockStatus
    ) {
    }
}
