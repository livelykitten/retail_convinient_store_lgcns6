package com.lgcns.retail.category.service;

import com.lgcns.retail.category.dto.CategoryResolveResponse;
import lombok.RequiredArgsConstructor;
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
                    .query(q)
                    .category(null)
                    .confidence(0.0)
                    .method("KEYWORD")
                    .build();
        }

        String normalizedQuery = q.trim();
        Optional<String> matchedCategory = keywordDictionary.findCategory(normalizedQuery);

        if (matchedCategory.isPresent()) {
            return CategoryResolveResponse.builder()
                    .query(normalizedQuery)
                    .category(matchedCategory.get())
                    .confidence(1.0)
                    .method("KEYWORD")
                    .build();
        }

        return CategoryResolveResponse.builder()
                .query(normalizedQuery)
                .category(null)
                .confidence(0.0)
                .method("KEYWORD")
                .build();
    }
}

