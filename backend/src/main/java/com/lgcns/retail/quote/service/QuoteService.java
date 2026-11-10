package com.lgcns.retail.quote.service;

import com.lgcns.retail.category.dto.CategoryResolveResponse;
import com.lgcns.retail.category.service.CategoryResolver;
import com.lgcns.retail.common.Brand;
import com.lgcns.retail.discount.dto.MatchedRule;
import com.lgcns.retail.discount.dto.Wallet;
import com.lgcns.retail.discount.service.DiscountRuleService;
import com.lgcns.retail.product.dto.ProductDto;
import com.lgcns.retail.product.entity.Event;
import com.lgcns.retail.product.service.ProductService;
import com.lgcns.retail.quote.dto.QuoteRequest;
import com.lgcns.retail.quote.dto.QuoteResponse;
import com.lgcns.retail.quote.dto.QuoteResponse.ProductQuote;
import com.lgcns.retail.quote.dto.QuoteResponse.StoreQuote;
import com.lgcns.retail.quote.dto.QuoteSort;
import com.lgcns.retail.quote.dto.StockStatus;
import com.lgcns.retail.quote.store.NearbyStore;
import com.lgcns.retail.quote.store.NearbyStoreSource;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * POST /api/quotes 조립 (API명세최종.md 4-2).
 * 검색어 → 상품군(한예림) → 상품(이서현) · 매장(노건우) · 할인 규칙 → 개당 가격 계산 → 정렬
 */
@Service
@RequiredArgsConstructor
public class QuoteService {

    // 도보 분 추정치 = ⌈직선거리 ÷ 67⌉ (분속 67m ≈ 시속 4km, API명세최종.md 4-2)
    private static final int WALK_METERS_PER_MINUTE = 67;

    private final CategoryResolver categoryResolver;
    private final ProductService productService;
    private final NearbyStoreSource nearbyStoreSource;
    private final DiscountRuleService discountRuleService;

    public QuoteResponse quote(QuoteRequest request) {
        String query = request.q().trim();

        // 1. 검색어 → 상품군. 못 찾으면 결과 없음
        CategoryResolveResponse resolved = categoryResolver.resolve(query);
        if (resolved == null || resolved.getCategory() == null) {
            return new QuoteResponse(query, List.of());
        }

        // 2. 상품군의 브랜드별 상품
        List<ProductDto> products = productService.findByCategory(resolved.getCategory());
        if (products.isEmpty()) {
            return new QuoteResponse(query, List.of());
        }

        // 3. 브랜드마다 반경 안 가장 가까운 매장 1곳 (매장 목록은 거리순)
        Map<Brand, NearbyStore> nearestByBrand = new EnumMap<>(Brand.class);
        for (NearbyStore store : nearbyStoreSource.findNearby(request.x(), request.y(), request.radiusOrDefault())) {
            nearestByBrand.putIfAbsent(store.brand(), store);
        }
        if (nearestByBrand.isEmpty()) {
            return new QuoteResponse(query, List.of());
        }

        // 4. 브랜드별 할인 규칙 (브랜드당 한 번만 조회)
        Wallet wallet = request.walletOrEmpty();
        Map<Brand, List<MatchedRule>> rulesByBrand = new EnumMap<>(Brand.class);
        for (Brand brand : nearestByBrand.keySet()) {
            rulesByBrand.put(brand, discountRuleService.findFor(wallet, brand));
        }

        // 5. 같은 상품(productKey)끼리 묶어서 매장별 개당 가격 계산
        Map<String, List<ProductDto>> byKey = new LinkedHashMap<>();
        for (ProductDto product : products) {
            byKey.computeIfAbsent(product.productKey(), k -> new ArrayList<>()).add(product);
        }

        List<ProductQuote> quotes = new ArrayList<>();
        for (List<ProductDto> sameProduct : byKey.values()) {
            List<StoreQuote> stores = new ArrayList<>();
            for (ProductDto product : sameProduct) {
                NearbyStore store = nearestByBrand.get(product.brand());
                if (store == null) {
                    continue; // 반경 안에 그 브랜드 매장이 없으면 빠진다
                }
                stores.add(toStoreQuote(product, store, rulesByBrand.get(product.brand())));
            }
            if (stores.isEmpty()) {
                continue; // stores가 빈 상품은 뺀다
            }
            quotes.add(toProductQuote(sameProduct, stores));
        }

        // 6. products 정렬
        quotes.sort(productOrder(request.sortOrDefault()));
        return new QuoteResponse(query, quotes);
    }

    private StoreQuote toStoreQuote(ProductDto product, NearbyStore store, List<MatchedRule> rules) {
        PriceCalculator.Result price = PriceCalculator.calculate(product.listPrice(), product.event(), rules);
        return new StoreQuote(
                store.storeId(),
                store.brand(),
                store.placeName(),
                store.x(),
                store.y(),
                store.distanceM(),
                walkMin(store.distanceM()),
                product.event(),
                eventLabel(product.event()),
                price.unitPrice(),
                price.applicableMethods(),
                StockStatusCalculator.statusOf(store.storeId(), product.productKey()));
    }

    private static final Comparator<StoreQuote> BY_PRICE = Comparator.comparingInt(StoreQuote::unitPrice)
            .thenComparingInt(StoreQuote::distanceM);

    /**
     * 상품 한 줄. event · listPrice · minUnitPrice = 대표 매장(살 수 있는 매장 중 개당 가격이 가장 싼 곳) 기준
     * stores 정렬 = unitPrice 오름차순 → distanceM 오름차순 → 재고 OUT은 맨 아래
     */
    private ProductQuote toProductQuote(List<ProductDto> sameProduct, List<StoreQuote> stores) {
        StoreQuote cheapest = representative(stores);
        // StoreQuote에는 정가가 없어서, 같은 묶음에서 그 매장 브랜드의 상품을 찾는다
        ProductDto cheapestProduct = sameProduct.stream()
                .filter(p -> p.brand() == cheapest.brand())
                .findFirst()
                .orElseThrow();
        ProductDto group = sameProduct.get(0);

        List<StoreQuote> sorted = stores.stream()
                .sorted(Comparator.comparing((StoreQuote s) -> s.stockStatus() == StockStatus.OUT)
                        .thenComparing(BY_PRICE))
                .toList();

        return new ProductQuote(
                group.productKey(),
                group.name(),
                group.imageUrl(),
                cheapest.event(),
                cheapestProduct.listPrice(),
                cheapest.unitPrice(),
                sorted.size(),
                sorted);
    }

    /**
     * 대표 매장 = 재고가 있는 매장(IN_STOCK · LOW) 중 개당 가격이 가장 싼 곳, 같으면 가까운 곳.
     * 모두 OUT이면 OUT 매장 중에서 고른다. 재고 없는 매장 가격이 "개당 최저가"로 보이지 않게 하려는 것 (결정 2026-11-10)
     */
    static StoreQuote representative(List<StoreQuote> stores) {
        return stores.stream()
                .filter(s -> s.stockStatus() != StockStatus.OUT)
                .min(BY_PRICE)
                .or(() -> stores.stream().min(BY_PRICE))
                .orElseThrow();
    }

    /** DISTANCE = 가장 가까운 매장의 거리 오름차순, PRICE = 개당 최저가 오름차순 (같으면 서로를 다음 기준으로) */
    private static Comparator<ProductQuote> productOrder(QuoteSort sort) {
        Comparator<ProductQuote> byDistance = Comparator.comparingInt(QuoteService::nearestDistance);
        Comparator<ProductQuote> byPrice = Comparator.comparingInt(ProductQuote::minUnitPrice);
        return sort == QuoteSort.PRICE ? byPrice.thenComparing(byDistance) : byDistance.thenComparing(byPrice);
    }

    private static int nearestDistance(ProductQuote product) {
        return product.stores().stream().mapToInt(StoreQuote::distanceM).min().orElse(Integer.MAX_VALUE);
    }

    static int walkMin(int distanceM) {
        return (distanceM + WALK_METERS_PER_MINUTE - 1) / WALK_METERS_PER_MINUTE;
    }

    /** 할인 유형 배지 문구. 행사 없음은 null */
    static String eventLabel(Event event) {
        return switch (event) {
            case NONE -> null;
            case ONE_PLUS_ONE -> "1+1 행사";
            case TWO_PLUS_ONE -> "2+1 행사";
            case THREE_PLUS_ONE -> "3+1 행사";
        };
    }
}
