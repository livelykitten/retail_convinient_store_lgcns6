package com.lgcns.retail.product.dto;

import com.lgcns.retail.common.Brand;
import com.lgcns.retail.product.entity.Event;
import com.lgcns.retail.product.entity.Product;
import com.lgcns.retail.product.entity.Unit;

public record ProductDto(
        String productId,
        String productKey,
        Brand brand,
        String name,
        String maker,
        String category,
        Integer size,
        Unit unit,
        String imageUrl,
        int listPrice,
        Event event
) {

    public static ProductDto from(Product product) {
        var group = product.getProductGroup();

        return new ProductDto(
                product.getProductId(),
                group.getProductKey(),
                product.getBrand(),
                group.getName(),
                group.getMaker(),
                group.getCategory(),
                group.getSize(),
                group.getUnit(),
                group.getImageUrl(),
                product.getListPrice(),
                product.getEvent()
        );
    }
}
