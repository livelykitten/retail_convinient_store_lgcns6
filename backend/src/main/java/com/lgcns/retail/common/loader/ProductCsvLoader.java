package com.lgcns.retail.common.loader;

import com.lgcns.retail.common.Brand;
import com.lgcns.retail.product.entity.Event;
import com.lgcns.retail.product.entity.Product;
import com.lgcns.retail.product.entity.ProductGroup;
import com.lgcns.retail.product.entity.Unit;
import com.lgcns.retail.product.repository.ProductGroupRepository;
import com.lgcns.retail.product.repository.ProductRepository;
import java.io.BufferedReader;
import java.io.InputStream;
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

        List<ProductGroup> groups = readGroupCsv();
        productGroupRepository.saveAll(groups);
        Map<String, ProductGroup> groupByKey = new HashMap<>();
        groups.forEach(g -> groupByKey.put(g.getProductKey(), g));

        List<Product> products = readProductCsv(groupByKey);
        productRepository.saveAll(products);

        logCategoryBrandCounts(products);
    }

    private List<ProductGroup> readGroupCsv() throws Exception {
        List<ProductGroup> groups = new ArrayList<>();

        try (BufferedReader reader = openReader(GROUP_CSV_PATH)) {
            reader.readLine(); // header skip
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }
                groups.add(parseGroupLine(line));
            }
        }

        return groups;
    }

    private ProductGroup parseGroupLine(String line) {
        String[] c = line.split(",", -1);

        return ProductGroup.builder()
                .productKey(c[0])
                .name(c[1])
                .maker(c[2].isBlank() ? null : c[2])
                .category(c[3].isBlank() ? null : c[3])
                .size(c[4].isBlank() ? null : Integer.parseInt(c[4]))
                .unit(c[5].isBlank() ? null : Unit.valueOf(c[5]))
                .imageUrl(c[6].isBlank() ? null : c[6])
                .build();
    }

    private List<Product> readProductCsv(Map<String, ProductGroup> groupByKey) throws Exception {
        List<Product> products = new ArrayList<>();

        try (BufferedReader reader = openReader(PRODUCT_CSV_PATH)) {
            reader.readLine(); // header skip
            String line;
            while ((line = reader.readLine()) != null) {
                if (line.isBlank()) {
                    continue;
                }
                products.add(parseProductLine(line, groupByKey));
            }
        }

        return products;
    }

    private Product parseProductLine(String line, Map<String, ProductGroup> groupByKey) {
        String[] c = line.split(",", -1);

        return Product.builder()
                .productId(c[0])
                .productGroup(groupByKey.get(c[1]))
                .brand(Brand.valueOf(c[2]))
                .sourceName(c[3])
                .listPrice(Integer.parseInt(c[4]))
                .event(Event.valueOf(c[5]))
                .build();
    }

    private BufferedReader openReader(String path) throws Exception {
        InputStream inputStream = new ClassPathResource(path).getInputStream();
        return new BufferedReader(new InputStreamReader(inputStream, StandardCharsets.UTF_8));
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
