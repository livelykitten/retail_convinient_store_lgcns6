package com.lgcns.retail.aiservice.service;

import com.lgcns.retail.aiservice.dto.CategoryResolveResponse;

public interface CategoryResolver {
    /**
     * 검색어(q)를 바탕으로 상품군(category)을 판별합니다.
     *
     * @param q 검색어 (1 ~ 30자)
     * @return CategoryResolveResponse (category, confidence, method)
     */
    CategoryResolveResponse resolve(String q);
}

