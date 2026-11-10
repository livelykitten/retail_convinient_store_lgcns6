package com.lgcns.retail.product.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.AccessLevel;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

/**
 * reference/erd.md. 같은 상품을 4사 공통으로 묶는 단위.
 */
@Entity
@Table(name = "product_group")
@Getter
@Builder
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor(access = AccessLevel.PRIVATE)
public class ProductGroup {

    @Id
    @Column(name = "product_key", length = 60)
    private String productKey;

    @Column(nullable = false, length = 100)
    private String name;

    @Column(length = 40)
    private String maker;

    /** NULL = 미분류. FR-08이 갱신 */
    @Column(length = 30)
    private String category;

    private Integer size;

    @Enumerated(EnumType.STRING)
    @Column(length = 5)
    private Unit unit;

    @Column(name = "image_url", length = 300)
    private String imageUrl;
}
