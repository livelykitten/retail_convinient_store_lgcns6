package com.lgcns.retail.category.controller;

import com.lgcns.retail.category.dto.CategoryResolveResponse;
import com.lgcns.retail.category.exception.InvalidParamException;
import com.lgcns.retail.category.service.CategoryResolver;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/categories")
@RequiredArgsConstructor
public class CategoryController {

    private final CategoryResolver categoryResolver;

    @GetMapping("/resolve")
    public ResponseEntity<CategoryResolveResponse> resolveCategory(
            @RequestParam(name = "q", required = false) String q) {

        if (q == null || q.trim().isEmpty()) {
            throw new InvalidParamException("검색어(q)는 1자 이상이어야 합니다.");
        }

        String trimmedQuery = q.trim();
        if (trimmedQuery.length() > 30) {
            throw new InvalidParamException("검색어(q)는 최대 30자까지 입력 가능합니다.");
        }

        CategoryResolveResponse response = categoryResolver.resolve(trimmedQuery);
        return ResponseEntity.ok(response);
    }
}

