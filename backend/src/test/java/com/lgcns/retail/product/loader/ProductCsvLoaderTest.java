package com.lgcns.retail.product.loader;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

class ProductCsvLoaderTest {

    @Test
    @DisplayName("큰따옴표 안의 쉼표는 값으로 읽고, 빈칸은 빈 문자열로 남긴다")
    void splitQuotedCells() {
        String[] cells = ProductCsvLoader.splitCsvLine("cu-1,\"신한카드 Deep Dream, 체크\",,\"say \"\"hi\"\"\"");

        assertThat(cells).containsExactly("cu-1", "신한카드 Deep Dream, 체크", "", "say \"hi\"");
    }

    @Test
    @DisplayName("줄 맨 앞의 BOM은 지운다")
    void stripBom() {
        String[] cells = ProductCsvLoader.splitCsvLine("\uFEFFproduct_key,name");

        assertThat(cells).containsExactly("product_key", "name");
    }
}
