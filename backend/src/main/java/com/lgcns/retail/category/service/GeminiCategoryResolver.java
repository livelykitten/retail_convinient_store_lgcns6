package com.lgcns.retail.category.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lgcns.retail.category.dto.CategoryResolveResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
public class GeminiCategoryResolver implements CategoryResolver {

    // quotes 전체가 3초 안에 끝나야 해서(FR-05) Gemini를 오래 기다리지 않는다
    private static final Duration CONNECT_TIMEOUT = Duration.ofSeconds(2);
    private static final Duration READ_TIMEOUT = Duration.ofSeconds(3);
    private static final int MAX_CACHE_SIZE = 1000;

    private final String apiKey;
    private final String apiUrl;
    private final KeywordCategoryResolver fallbackResolver;
    private final KeywordDictionary keywordDictionary;
    private final RestClient restClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // 스프린트 2 요구사항: 같은 검색어 재사용 (In-Memory Cache)
    private final Map<String, CategoryResolveResponse> queryCache = new ConcurrentHashMap<>();

    public GeminiCategoryResolver(
            @Value("${gemini.api.key:}") String apiKey,
            @Value("${gemini.api.url:https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent}") String apiUrl,
            KeywordCategoryResolver fallbackResolver,
            KeywordDictionary keywordDictionary) {
        this.apiKey = apiKey;
        this.apiUrl = apiUrl;
        this.fallbackResolver = fallbackResolver;
        this.keywordDictionary = keywordDictionary;

        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(CONNECT_TIMEOUT);
        requestFactory.setReadTimeout(READ_TIMEOUT);
        this.restClient = RestClient.builder().requestFactory(requestFactory).build();
    }

    @Override
    public CategoryResolveResponse resolve(String q) {
        if (q == null || q.trim().isEmpty()) {
            return fallbackResolver.resolve(q);
        }

        String normalizedQuery = q.trim();

        // 캐시 확인 (같은 검색어 재사용)
        CategoryResolveResponse cached = queryCache.get(normalizedQuery);
        if (cached != null) {
            log.info("Gemini Category Cache Hit for query: {}", normalizedQuery);
            return cached;
        }

        // API Key 미설정 시 키워드 사전으로 Fallback (키가 없으면 결과가 바뀌지 않으므로 캐시해도 된다)
        if (apiKey == null || apiKey.isBlank()) {
            log.warn("Gemini API Key가 설정되지 않아 키워드 사전(KEYWORD)으로 대체합니다.");
            CategoryResolveResponse fallbackResult = fallbackResolver.resolve(normalizedQuery);
            putCache(normalizedQuery, fallbackResult);
            return fallbackResult;
        }

        // Gemini API 호출
        try {
            CategoryResolveResponse response = callGemini(normalizedQuery);
            if (response != null) {
                putCache(normalizedQuery, response);
                return response;
            }
            // Gemini가 정상 응답했지만 상품군을 못 정함 → 키워드 사전 결과를 캐시 (다시 물어도 같음)
            CategoryResolveResponse fallbackResult = fallbackResolver.resolve(normalizedQuery);
            putCache(normalizedQuery, fallbackResult);
            return fallbackResult;
        } catch (Exception e) {
            // 예외 메시지에 요청 정보가 섞일 수 있어 종류만 남긴다
            log.error("Gemini 호출 실패({}), 키워드 사전으로 폴백합니다.", e.getClass().getSimpleName());
        }

        // 호출 실패 시 Fallback. 일시 장애일 수 있으니 캐시하지 않고 다음 요청에서 다시 시도한다
        return fallbackResolver.resolve(normalizedQuery);
    }

    private void putCache(String query, CategoryResolveResponse response) {
        if (queryCache.size() >= MAX_CACHE_SIZE) {
            queryCache.clear();
        }
        queryCache.put(query, response);
    }

    private CategoryResolveResponse callGemini(String query) throws Exception {
        String availableCategories = String.join(", ", keywordDictionary.getAllKeywords().keySet());

        String prompt = String.format("""
                너는 편의점 상품 검색어 카테고리 분류 AI야.
                사용자의 검색어 '%s'가 다음 편의점 카테고리 중 어느 것에 속하는지 판별해줘.

                선택 가능한 카테고리 목록: [%s]

                분류 가이드:
                - 우유, 바나나우유, 유제품류 -> MILK
                - 커피, 아메리카노, 라떼, 바리스타룰스 등 -> COFFEE
                - 콜라, 코카콜라, 펩시, 제로콜라 -> COLA
                - 사이다, 환타, 웰치스, 탄산수 등 콜라가 아닌 탄산음료 -> SODA
                - 라면, 컵라면, 봉지라면 -> RAMEN
                - 초콜릿, 초코 -> CHOCOLATE
                - 과자, 스낵, 감자칩 -> SNACK
                - 도시락, 김밥, 삼각김밥, 샌드위치 -> LUNCHBOX
                - 아이스크림 -> ICECREAM
                - 맥주, 소주, 주류 -> BEER

                위 목록 중 가장 알맞은 카테고리 1개를 선택해줘. 전혀 관련이 없으면 category를 null로 지정해.
                반드시 아래 JSON 형식으로만 응답해 (다른 설명 금지).
                {
                  "category": "선택한_카테고리명_또는_null",
                  "confidence": 0.0에서 1.0 사이의_실수
                }
                """, query, availableCategories);

        Map<String, Object> requestBody = Map.of(
                "contents", List.of(
                        Map.of("parts", List.of(
                                Map.of("text", prompt)))));

        // 키를 URL 쿼리로 보내면 연결 오류 메시지 · 로그에 URL째로 남을 수 있어 헤더로 보낸다
        String rawResponse = restClient.post()
                .uri(apiUrl)
                .header("x-goog-api-key", apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .body(requestBody)
                .retrieve()
                .body(String.class);

        return parseGeminiResponse(query, rawResponse);
    }

    CategoryResolveResponse parseGeminiResponse(String query, String rawResponse) {
        try {
            JsonNode root = objectMapper.readTree(rawResponse);
            JsonNode textNode = root.path("candidates").path(0)
                    .path("content").path("parts").path(0).path("text");

            if (textNode.isMissingNode()) {
                return null;
            }

            String text = textNode.asText().trim();
            if (text.startsWith("```json")) {
                text = text.substring(7);
            } else if (text.startsWith("```")) {
                text = text.substring(3);
            }
            if (text.endsWith("```")) {
                text = text.substring(0, text.length() - 3);
            }
            text = text.trim();

            JsonNode parsed = objectMapper.readTree(text);
            String category = parsed.path("category").isNull() ? null : parsed.path("category").asText();
            double confidence = parsed.path("confidence").asDouble(0.9);

            if (category == null || "null".equalsIgnoreCase(category) || category.isBlank()) {
                return null;
            }

            // 목록 밖 상품군(예: JUICE)을 그대로 내보내면 quotes가 상품을 못 찾는다
            String upperCategory = category.toUpperCase();
            if (!keywordDictionary.isKnownCategory(upperCategory)) {
                log.warn("Gemini가 목록에 없는 상품군을 돌려줌: {}", upperCategory);
                return null;
            }

            return CategoryResolveResponse.builder()
                    .query(query)
                    .category(upperCategory)
                    .confidence(confidence)
                    .method("AI")
                    .build();
        } catch (Exception e) {
            log.warn("Gemini 응답 파싱 실패: {}", e.getClass().getSimpleName());
            return null;
        }
    }
}
