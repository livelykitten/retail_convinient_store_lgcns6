package com.lgcns.retail.product.loader;

import com.lgcns.retail.common.Brand;
import com.lgcns.retail.product.entity.Event;
import com.lgcns.retail.product.entity.Product;
import com.lgcns.retail.product.entity.ProductGroup;
import com.lgcns.retail.product.entity.Unit;
import com.lgcns.retail.product.repository.ProductGroupRepository;
import com.lgcns.retail.product.repository.ProductRepository;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * 앱이 뜰 때 상품 CSV를 다시 적재한다 (FR-07).
 * product 모듈의 엔티티 · 리포지토리를 쓰므로 product 모듈 안에 둔다 (design.md: common은 다른 모듈을 쓰지 않음).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ProductCsvLoader implements CommandLineRunner {

    private static final String GROUP_CSV_PATH = "data/product_group.csv";
    private static final String PRODUCT_CSV_PATH = "data/products.csv";

    private final ProductGroupRepository productGroupRepository;
    private final ProductRepository productRepository;

    @Override
    public void run(String... args) throws Exception {
        productRepository.deleteAll();
        productGroupRepository.deleteAll();

        List<ProductGroup> groups = readCsv(GROUP_CSV_PATH).stream()
                .map(this::toGroup)
                .toList();
        productGroupRepository.saveAll(groups);

        Map<String, ProductGroup> groupByKey = new HashMap<>();
        groups.forEach(g -> groupByKey.put(g.getProductKey(), g));

        List<Product> products = readCsv(PRODUCT_CSV_PATH).stream()
                .map(row -> toProduct(row, groupByKey))
                .toList();
        productRepository.saveAll(products);

        logCategoryBrandCounts(products);
    }

    private ProductGroup toGroup(Row row) {
        String[] c = row.cells();
        return ProductGroup.builder()
                .productKey(c[0])
                .name(c[1])
                .maker(blankToNull(c[2]))
                .category(blankToNull(c[3]))
                .size(c[4].isBlank() ? null : Integer.parseInt(c[4]))
                .unit(c[5].isBlank() ? null : Unit.valueOf(c[5]))
                .imageUrl(blankToNull(c[6]))
                .build();
    }

    private Product toProduct(Row row, Map<String, ProductGroup> groupByKey) {
        String[] c = row.cells();
        ProductGroup group = groupByKey.get(c[1]);
        if (group == null) {
            throw new IllegalStateException(PRODUCT_CSV_PATH + " " + row.lineNo()
                    + "번째 줄: product_group.csv에 없는 product_key '" + c[1] + "'");
        }
        return Product.builder()
                .productId(c[0])
                .productGroup(group)
                .brand(Brand.valueOf(c[2]))
                .sourceName(c[3])
                .listPrice(Integer.parseInt(c[4]))
                .event(Event.valueOf(c[5]))
                .build();
    }

    private record Row(int lineNo, String[] cells) {
    }

    /** 첫 줄(헤더)과 빈 줄은 건너뛴다. 엑셀이 붙이는 BOM도 지운다. */
    private List<Row> readCsv(String path) throws IOException {
        List<Row> rows = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                new ClassPathResource(path).getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            int lineNo = 0;
            while ((line = reader.readLine()) != null) {
                lineNo++;
                if (lineNo == 1 || line.isBlank()) {
                    continue;
                }
                rows.add(new Row(lineNo, splitCsvLine(line)));
            }
        }
        return rows;
    }

    /** 큰따옴표로 감싼 값 안의 쉼표와 "" (따옴표 한 개)를 처리한다. */
    static String[] splitCsvLine(String line) {
        List<String> cells = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (quoted) {
                if (ch == '"' && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    cell.append('"');
                    i++;
                } else if (ch == '"') {
                    quoted = false;
                } else {
                    cell.append(ch);
                }
            } else if (ch == '"') {
                quoted = true;
            } else if (ch == ',') {
                cells.add(cell.toString());
                cell.setLength(0);
            } else if (ch != '﻿') {
                cell.append(ch);
            }
        }
        cells.add(cell.toString());
        return cells.toArray(String[]::new);
    }

    private static String blankToNull(String value) {
        return value.isBlank() ? null : value;
    }

    private void logCategoryBrandCounts(List<Product> products) {
        Map<String, Map<Brand, Long>> countByCategoryAndBrand = new TreeMap<>();

        for (Product product : products) {
            String category = product.getProductGroup().getCategory() == null
                    ? "미분류"
                    : product.getProductGroup().getCategory();
            countByCategoryAndBrand
                    .computeIfAbsent(category, k -> new TreeMap<>())
                    .merge(product.getBrand(), 1L, Long::sum);
        }

        log.info("상품 적재 완료: 총 {}건", products.size());
        countByCategoryAndBrand.forEach((category, brandCounts) ->
                log.info("[{}] {}", category, brandCounts));
    }
}
