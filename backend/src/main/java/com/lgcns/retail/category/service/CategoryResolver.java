package com.lgcns.retail.category.service;

import com.lgcns.retail.category.dto.CategoryResolveResponse;

public interface CategoryResolver {
    /**
     * 검색어(q)를 바탕으로 상품군(category)을 판별합니다.
     *
     * @param q 검색어 (1 ~ 30자)
     * @return CategoryResolveResponse (query, category, confidence, method)
     */
    CategoryResolveResponse resolve(String q);
}

