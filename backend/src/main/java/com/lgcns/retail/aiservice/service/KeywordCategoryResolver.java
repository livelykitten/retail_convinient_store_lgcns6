package com.lgcns.retail.aiservice.service;

import com.lgcns.retail.aiservice.dto.CategoryResolveResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;

import java.util.Optional;

@Service
@RequiredArgsConstructor
public class KeywordCategoryResolver implements CategoryResolver {

    private final KeywordDictionary keywordDictionary;

    @Override
    public CategoryResolveResponse resolve(String q) {
        if (q == null || q.trim().isEmpty()) {
            return CategoryResolveResponse.builder()
                    .category(null)
                    .confidence(0.0)
                    .method("KEYWORD")
                    .build();
        }

        Optional<String> matchedCategory = keywordDictionary.findCategory(q);

        if (matchedCategory.isPresent()) {
            return CategoryResolveResponse.builder()
                    .category(matchedCategory.get())
                    .confidence(1.0)
                    .method("KEYWORD")
                    .build();
        }

        // 일치하는 카테고리가 없는 경우
        return CategoryResolveResponse.builder()
                    .category(null)
                    .confidence(0.0)
                    .method("KEYWORD")
                    .build();
    }
}

