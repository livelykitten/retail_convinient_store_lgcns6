package com.lgcns.retail.product.loader;

import static org.assertj.core.api.Assertions.assertThat;

import com.lgcns.retail.product.entity.Event;
import java.nio.charset.StandardCharsets;
import java.sql.DriverManager;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

class OtherEventSchemaTest {
    @Test
    void other행사도_원본스키마에_적재할수있다() throws Exception {
        String schema = new ClassPathResource("schema.sql").getContentAsString(StandardCharsets.UTF_8);
        try (var connection = DriverManager.getConnection("jdbc:h2:mem:other-event;DB_CLOSE_DELAY=-1");
                var statement = connection.createStatement()) {
            statement.execute(schema);
            statement.executeUpdate("INSERT INTO product_group(product_key,name,category) VALUES ('test-cola','콜라','COLA')");
            statement.executeUpdate("INSERT INTO product(product_id,product_key,brand,source_name,list_price,event) "
                    + "VALUES ('seven-test','test-cola','SEVEN','콜라',2000,'OTHER')");
            try (var rows = statement.executeQuery("SELECT event FROM product WHERE product_id='seven-test'")) {
                assertThat(rows.next()).isTrue();
                assertThat(Event.valueOf(rows.getString(1))).isEqualTo(Event.OTHER);
            }
        }
    }
}
