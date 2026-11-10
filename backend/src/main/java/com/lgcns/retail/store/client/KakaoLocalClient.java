package com.lgcns.retail.store.client;

import java.time.Duration;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpHeaders;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.fasterxml.jackson.annotation.JsonProperty;

import lombok.extern.slf4j.Slf4j;

/** 카카오 로컬 API의 카테고리 검색으로 주변 편의점을 조회한다. 응답은 메모리에서만 쓴다. */
@Slf4j
@Component
public class KakaoLocalClient {

    private static final String BASE_URL = "https://dapi.kakao.com";
    private static final String CONVENIENCE_STORE_CODE = "CS2";
    private static final String ERROR_MESSAGE = "매장 정보를 불러오지 못했어요";
    private static final int PAGE_SIZE = 15;
    // 카카오는 한 영역에서 최대 45건까지만 내려주므로 넘치면 영역을 4등분해 다시 조회한다.
    private static final int MAX_PAGEABLE = 45;
    private static final int MAX_SPLIT_DEPTH = 8;
    private static final double METERS_PER_LAT_DEGREE = 111_320;
    private static final double EARTH_RADIUS_METERS = 6_371_000;

    private final RestClient restClient;
    private final String restApiKey;

    @Autowired
    public KakaoLocalClient(@Value("${KAKAO_REST_API_KEY:}") String restApiKey) {
        this(restApiKey, RestClient.builder()
                .baseUrl(BASE_URL)
                .requestFactory(requestFactory())
                .build());
    }

    KakaoLocalClient(String restApiKey, RestClient restClient) {
        this.restApiKey = restApiKey;
        this.restClient = restClient;
    }

    private static SimpleClientHttpRequestFactory requestFactory() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(Duration.ofSeconds(2));
        factory.setReadTimeout(Duration.ofSeconds(3));
        return factory;
    }

    /**
     * 반경 안의 편의점을 가까운 순으로 반환한다. x는 경도, y는 위도.
     * 페이지 중 하나라도 실패하면 받은 결과를 버리고 예외를 던진다 (design.md 3장).
     */
    public List<Place> findConvenienceStores(double x, double y, int radiusMeters) {
        if (restApiKey.isBlank()) {
            log.error("환경변수 KAKAO_REST_API_KEY가 설정되지 않았습니다.");
            throw new KakaoApiException(ERROR_MESSAGE);
        }

        double latDelta = radiusMeters / METERS_PER_LAT_DEGREE;
        double lngDelta = latDelta / Math.cos(Math.toRadians(y));

        Map<String, Place> found = new HashMap<>();
        collect(x - lngDelta, y - latDelta, x + lngDelta, y + latDelta, 0, found);

        return found.values().stream()
                .map(place -> place.withDistance(distanceMeters(x, y, place)))
                .filter(place -> Integer.parseInt(place.distance()) <= radiusMeters)
                .sorted(Comparator.comparingInt(place -> Integer.parseInt(place.distance())))
                .toList();
    }

    private void collect(double left, double bottom, double right, double top, int depth, Map<String, Place> found) {
        SearchResponse response = fetchPage(left, bottom, right, top, 1);

        if (response.meta().totalCount() > MAX_PAGEABLE) {
            if (depth < MAX_SPLIT_DEPTH) {
                double midX = (left + right) / 2;
                double midY = (bottom + top) / 2;
                collect(left, bottom, midX, midY, depth + 1, found);
                collect(midX, bottom, right, midY, depth + 1, found);
                collect(left, midY, midX, top, depth + 1, found);
                collect(midX, midY, right, top, depth + 1, found);
                return;
            }
            log.warn("영역을 더 나눌 수 없어 일부 매장이 누락될 수 있습니다. total={}", response.meta().totalCount());
        }

        addAll(response, found);
        for (int page = 2; !response.meta().isEnd(); page++) {
            response = fetchPage(left, bottom, right, top, page);
            addAll(response, found);
        }
    }

    private static void addAll(SearchResponse response, Map<String, Place> found) {
        response.documents().forEach(place -> found.put(place.id(), place));
    }

    private SearchResponse fetchPage(double left, double bottom, double right, double top, int page) {
        String rect = left + "," + bottom + "," + right + "," + top;
        try {
            SearchResponse response = restClient.get()
                    .uri(uri -> uri.path("/v2/local/search/category.json")
                            .queryParam("category_group_code", CONVENIENCE_STORE_CODE)
                            .queryParam("rect", rect)
                            .queryParam("page", page)
                            .queryParam("size", PAGE_SIZE)
                            .build())
                    .header(HttpHeaders.AUTHORIZATION, "KakaoAK " + restApiKey)
                    .retrieve()
                    .body(SearchResponse.class);
            if (response == null) {
                log.warn("카카오 매장 조회 응답이 비어 있습니다.");
                throw new KakaoApiException(ERROR_MESSAGE);
            }
            return response;
        } catch (HttpClientErrorException.TooManyRequests e) {
            throw new KakaoRateLimitException();
        } catch (RestClientException e) {
            log.warn("카카오 매장 조회 실패: {}", e.getMessage());
            throw new KakaoApiException(ERROR_MESSAGE, e);
        }
    }

    private static int distanceMeters(double x, double y, Place place) {
        double storeY = Double.parseDouble(place.y());
        double storeX = Double.parseDouble(place.x());
        double dLat = Math.toRadians(storeY - y);
        double dLng = Math.toRadians(storeX - x);
        double a = Math.pow(Math.sin(dLat / 2), 2)
                + Math.cos(Math.toRadians(y)) * Math.cos(Math.toRadians(storeY)) * Math.pow(Math.sin(dLng / 2), 2);
        return (int) Math.round(2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(a)));
    }

    record SearchResponse(Meta meta, List<Place> documents) {
    }

    record Meta(
            @JsonProperty("total_count") int totalCount,
            @JsonProperty("is_end") boolean isEnd) {
    }

    public record Place(
            String id,
            @JsonProperty("place_name") String placeName,
            @JsonProperty("road_address_name") String roadAddressName,
            String x,
            String y,
            String distance) {

        Place withDistance(int meters) {
            return new Place(id, placeName, roadAddressName, x, y, String.valueOf(meters));
        }
    }
}
