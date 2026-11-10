package com.lgcns.retail.store.client;

import java.time.Duration;
import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/** TMAP 보행자 경로 API로 실제 도보 소요 시간을 조회한다. */
@Component
public class TmapWalkingClient {

    private static final String BASE_URL = "https://apis.openapi.sk.com";

    private final RestClient restClient;
    private final String appKey;

    @Autowired
    public TmapWalkingClient(@Value("${TMAP_APP_KEY:}") String appKey) {
        this(appKey, RestClient.builder()
                .baseUrl(BASE_URL)
                .requestFactory(requestFactory())
                .build());
    }

    TmapWalkingClient(String appKey, RestClient restClient) {
        this.appKey = appKey;
        this.restClient = restClient;
    }

    private static SimpleClientHttpRequestFactory requestFactory() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(2));
        factory.setReadTimeout(Duration.ofSeconds(3));
        return factory;
    }

    /** 출발지에서 도착지까지 걸어가는 시간을 분으로 반환한다. 1초라도 넘으면 올림. x는 경도, y는 위도. */
    public int walkingMinutes(double startX, double startY, double endX, double endY) {
        if (appKey.isBlank()) {
            throw new IllegalStateException("환경변수 TMAP_APP_KEY가 설정되지 않았습니다.");
        }

        RouteResponse response = restClient.post()
                .uri("/tmap/routes/pedestrian?version=1")
                .header("appKey", appKey)
                .contentType(MediaType.APPLICATION_JSON)
                .body(new RouteRequest(startX, startY, endX, endY, "start", "end"))
                .retrieve()
                .body(RouteResponse.class);

        // 전체 소요 시간은 첫 번째 feature에만 들어 있다.
        int seconds = response.features().get(0).properties().totalTime();
        return (seconds + 59) / 60;
    }

    record RouteRequest(
            double startX, double startY,
            double endX, double endY,
            String startName, String endName) {
    }

    record RouteResponse(List<Feature> features) {
    }

    record Feature(Properties properties) {
    }

    record Properties(Integer totalTime) {
    }
}
