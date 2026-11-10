package com.lgcns.retail.product.entity;

import com.lgcns.retail.common.Brand;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * reference/erd.md. 한 브랜드에서 파는 상품의 정가 · 행사.
 */
@Entity
@Table(name = "product")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class Product {

    @Id
    @Column(name = "product_id", length = 40)
    private String productId;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "product_key", nullable = false)
    private ProductGroup productGroup;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private Brand brand;

    @Column(name = "source_name", nullable = false, length = 100)
    private String sourceName;

    @Column(name = "list_price", nullable = false)
    private int listPrice;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private Event event;
}
