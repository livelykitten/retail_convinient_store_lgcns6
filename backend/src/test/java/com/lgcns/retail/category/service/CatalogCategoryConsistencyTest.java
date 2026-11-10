package com.lgcns.retail.category.service;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.Set;
import java.util.TreeSet;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

/**
 * 상품 CSV의 상품군과 키워드 사전의 상품군이 같은지 (erd.md 3-1).
 * product_group.category에는 DB CHECK가 없어서, 이름이 다르면 오류 없이 적재되고 검색에서만 조용히 빠진다.
 */
class CatalogCategoryConsistencyTest {

    @Test
    @DisplayName("product_group.csv의 상품군은 모두 키워드 사전(상품군 목록)에 있다")
    void csvCategoriesAreKnown() throws Exception {
        KeywordDictionary dictionary = new KeywordDictionary();
        Set<String> unknown = new TreeSet<>();

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                new ClassPathResource("data/product_group.csv").getInputStream(), StandardCharsets.UTF_8))) {
            String header = reader.readLine().replace("﻿", "");
            int column = java.util.Arrays.asList(header.split(",")).indexOf("category");
            assertThat(column).as("category 칼럼").isGreaterThanOrEqualTo(0);

            String line;
            while ((line = reader.readLine()) != null) {
                String category = categoryOf(line, column);
                if (!category.isEmpty() && !dictionary.isKnownCategory(category)) {
                    unknown.add(category);
                }
            }
        }

        assertThat(unknown).as("키워드 사전에 없는 상품군").isEmpty();
    }

    /** 따옴표로 감싼 칸(쉼표 포함 상품명)을 건너뛰며 column번째 칸을 읽는다 */
    private static String categoryOf(String line, int column) {
        int index = 0;
        StringBuilder cell = new StringBuilder();
        boolean quoted = false;
        for (char c : line.toCharArray()) {
            if (c == '"') {
                quoted = !quoted;
            } else if (c == ',' && !quoted) {
                if (index == column) {
                    return cell.toString().trim();
                }
                index++;
                cell.setLength(0);
            } else {
                cell.append(c);
            }
        }
        return index == column ? cell.toString().trim() : "";
    }
}
