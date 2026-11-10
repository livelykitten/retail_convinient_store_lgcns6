package com.lgcns.retail.store.road;

import java.time.Duration;
import java.util.List;

import com.lgcns.retail.store.client.KakaoApiException;
import com.lgcns.retail.store.client.KakaoRateLimitException;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import lombok.extern.slf4j.Slf4j;

/** 카카오 도보 경로 API를 호출한다. 응답은 메모리에서만 쓴다. */
@Slf4j
@Component
public class KakaoWalkingClient {

    private static final String BASE_URL = "https://dapi.kakao.com";
    // API명세 4-4 오류 표의 KAKAO_ERROR 문구
    private static final String ERROR_MESSAGE = "도보 경로를 불러오지 못했어요";

    private final RestClient restClient;
    private final String restApiKey;

    @Autowired
    public KakaoWalkingClient(@Value("${KAKAO_REST_API_KEY:}") String restApiKey) {
        this(restApiKey, RestClient.builder()
                .baseUrl(BASE_URL)
                .requestFactory(requestFactory())
                .build());
    }

    KakaoWalkingClient(String restApiKey, RestClient restClient) {
        this.restApiKey = restApiKey;
        this.restClient = restClient;
    }

    private static SimpleClientHttpRequestFactory requestFactory() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(2));
        factory.setReadTimeout(Duration.ofSeconds(3));
        return factory;
    }

    public WalkResponse findRoute(double startX, double startY, double endX, double endY) {
        if (restApiKey.isBlank()) {
            log.error("환경변수 KAKAO_REST_API_KEY가 설정되지 않았습니다.");
            throw new KakaoApiException(ERROR_MESSAGE);
        }

        WalkResponse response;
        try {
            response = restClient.get()
                    .uri(uri -> uri.path("/v2/routing/walk")
                            .queryParam("start_x", startX)
                            .queryParam("start_y", startY)
                            .queryParam("end_x", endX)
                            .queryParam("end_y", endY)
                            .queryParam("input_coord", "WGS84")
                            .queryParam("output_coord", "WGS84")
                            .build())
                    .header(HttpHeaders.AUTHORIZATION, "KakaoAK " + restApiKey)
                    .retrieve()
                    .body(WalkResponse.class);
        } catch (HttpClientErrorException.TooManyRequests e) {
            throw new KakaoRateLimitException();
        } catch (HttpClientErrorException e) {
            // 경로 탐색 실패가 HTTP 오류로 올 수도 있어서 본문의 status를 확인한다.
            log.warn("카카오 도보 경로 HTTP {}: {}", e.getStatusCode().value(), e.getResponseBodyAsString());
            response = readBody(e);
        } catch (RestClientException e) {
            log.warn("카카오 도보 경로 호출 실패: {}", e.getMessage());
            throw new KakaoApiException(ERROR_MESSAGE, e);
        }

        if (response == null || response.status() == null) {
            log.warn("카카오 도보 경로 응답을 해석할 수 없습니다.");
            throw new KakaoApiException(ERROR_MESSAGE);
        }
        return response;
    }

    private static WalkResponse readBody(HttpClientErrorException e) {
        try {
            return e.getResponseBodyAs(WalkResponse.class);
        } catch (RuntimeException parseFailure) {
            return null;
        }
    }

    public record WalkResponse(String status, Route route) {
    }

    public record Route(Properties properties, List<Leg> legs) {
    }

    public record Properties(int totalDistance, int totalTime, String landingUrl) {
    }

    public record Leg(List<Step> steps) {
    }

    public record Step(Path path) {
    }

    public record Path(double[][] points) {
    }
}
