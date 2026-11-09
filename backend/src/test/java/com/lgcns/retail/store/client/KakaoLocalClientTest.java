package com.lgcns.retail.store.client;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.hamcrest.Matchers.startsWith;

import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class KakaoLocalClientTest {

    private static final double X = 127.0571;
    private static final double Y = 37.5431;

    private final RestClient.Builder builder = RestClient.builder().baseUrl("https://dapi.kakao.com");
    private final MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
    private final KakaoLocalClient client = new KakaoLocalClient("test-key", builder.build());

    private org.springframework.test.web.client.ResponseActions expectSearch() {
        return server.expect(once(), requestTo(startsWith("https://dapi.kakao.com/v2/local/search/category.json")))
                .andExpect(queryParam("category_group_code", "CS2"))
                .andExpect(header("Authorization", "KakaoAK test-key"));
    }

    @Test
    @DisplayName("카카오 응답을 거리순으로 바꾸고 반경 밖 매장은 뺀다")
    void parsesAndSorts() {
        expectSearch().andRespond(withSuccess("""
                {"meta":{"total_count":3,"pageable_count":3,"is_end":true},
                 "documents":[
                  {"id":"far","place_name":"CU 먼점","road_address_name":"도로 1","x":"127.0571","y":"37.5441","category_name":"편의점"},
                  {"id":"near","place_name":"GS25 가까운점","road_address_name":"도로 2","x":"127.0571","y":"37.5432"},
                  {"id":"out","place_name":"CU 반경밖점","road_address_name":"도로 3","x":"127.0571","y":"37.5500"}
                 ]}""", MediaType.APPLICATION_JSON));

        List<KakaoLocalClient.Place> places = client.findConvenienceStores(X, Y, 500);

        assertThat(places).extracting(KakaoLocalClient.Place::id).containsExactly("near", "far");
        assertThat(places.get(0).distance()).isEqualTo("11");
        server.verify();
    }

    @Test
    @DisplayName("카카오 429는 KakaoRateLimitException으로 바꾼다")
    void rateLimit() {
        expectSearch().andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));

        assertThatThrownBy(() -> client.findConvenienceStores(X, Y, 500))
                .isInstanceOf(KakaoRateLimitException.class);
    }

    @Test
    @DisplayName("그 밖의 카카오 오류는 KakaoApiException으로 바꾼다")
    void otherError() {
        expectSearch().andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR));

        assertThatThrownBy(() -> client.findConvenienceStores(X, Y, 500))
                .isInstanceOf(KakaoApiException.class);
    }

    @Test
    @DisplayName("다음 페이지가 실패하면 받은 결과를 버리고 예외를 던진다")
    void allOrNothing() {
        expectSearch().andRespond(withSuccess("""
                {"meta":{"total_count":16,"is_end":false},
                 "documents":[{"id":"1","place_name":"CU 성수점","road_address_name":"도로","x":"127.0571","y":"37.5432"}]}""",
                MediaType.APPLICATION_JSON));
        expectSearch().andRespond(withStatus(HttpStatus.BAD_GATEWAY));

        assertThatThrownBy(() -> client.findConvenienceStores(X, Y, 500))
                .isInstanceOf(KakaoApiException.class);
    }
}
