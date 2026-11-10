package com.lgcns.retail.category.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lgcns.retail.category.dto.CategoryResolveResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@Primary
public class ClaudeCategoryResolver implements CategoryResolver {

    private static final int MAX_CACHE_SIZE = 500;

    private final String apiKey;
    private final String apiUrl;
    private final String model;
    private final KeywordCategoryResolver fallbackResolver;
    private final KeywordDictionary keywordDictionary;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // 스프린트 2 요구사항: 같은 검색어 재사용 (In-Memory Cache)
    private final Map<String, CategoryResolveResponse> queryCache = new ConcurrentHashMap<>();

    public ClaudeCategoryResolver(
            @Value("${claude.api.key:}") String apiKey,
            @Value("${claude.api.url:https://api.anthropic.com/v1/messages}") String apiUrl,
            @Value("${claude.model:claude-opus-5-5}") String model,
            KeywordCategoryResolver fallbackResolver,
            KeywordDictionary keywordDictionary) {
        this.apiKey = apiKey;
        this.apiUrl = apiUrl;
        this.model = model;
        this.fallbackResolver = fallbackResolver;
        this.keywordDictionary = keywordDictionary;
    }

    @Override
    public CategoryResolveResponse resolve(String q) {
        if (q == null || q.trim().isEmpty()) {
            return fallbackResolver.resolve(q);
        }

        String normalizedQuery = q.trim();

        // 1. 캐시 확인
        CategoryResolveResponse cached = queryCache.get(normalizedQuery);
        if (cached != null) {
            log.info("Claude Category Cache Hit for query: {}", normalizedQuery);
            return cached;
        }

        // 2. API Key 미설정 시 키워드 사전으로 Fallback
        if (apiKey == null || apiKey.isBlank()) {
            log.warn("Claude API Key가 설정되지 않아 키워드 사전(KEYWORD)으로 대체합니다.");
            CategoryResolveResponse fallbackResult = fallbackResolver.resolve(normalizedQuery);
            putCache(normalizedQuery, fallbackResult);
            return fallbackResult;
        }

        // 3. Claude API 호출
        try {
            CategoryResolveResponse response = callClaude(normalizedQuery);
            if (response != null) {
                putCache(normalizedQuery, response);
                return response;
            }
            CategoryResolveResponse fallbackResult = fallbackResolver.resolve(normalizedQuery);
            putCache(normalizedQuery, fallbackResult);
            return fallbackResult;
        } catch (Exception e) {
            log.error("Claude 호출 실패({}): {}", e.getClass().getSimpleName(), e.getMessage());
        }

        // 4. 호출 실패 시 Fallback (일시 장애일 수 있으니 캐시하지 않음)
        return fallbackResolver.resolve(normalizedQuery);
    }

    private void putCache(String query, CategoryResolveResponse response) {
        if (queryCache.size() >= MAX_CACHE_SIZE) {
            queryCache.clear();
        }
        queryCache.put(query, response);
    }

    private CategoryResolveResponse callClaude(String query) throws Exception {
        String availableCategories = String.join(", ", keywordDictionary.getAllKeywords().keySet());

        String prompt = String.format("""
                너는 편의점 상품 검색어 카테고리 분류 AI야.
                사용자의 검색어 '%s'가 다음 편의점 카테고리 중 어느 것에 속하는지 판별해줘.

                선택 가능한 카테고리 목록: [%s]

                분류 가이드:
                - 우유, 바나나우유, 유제품류 -> MILK
                - 커피, 아메리카노, 라떼, 바리스타룰스 등 -> COFFEE
                - 콜라, 제로콜라, 펩시 -> COLA
                - 사이다, 환타, 웰치스, 탄산수 등 콜라가 아닌 탄산음료 -> SODA
                - 라면, 컵라면, 봉지라면 -> RAMEN
                - 초콜릿, 초코 -> CHOCOLATE
                - 과자, 스낵, 감자칩 -> SNACK
                - 도시락, 김밥, 삼각김밥, 샌드위치 -> LUNCHBOX
                - 아이스크림 -> ICECREAM
                - 맥주, 소주, 주류 -> BEER

                위 목록 중 가장 알맞은 카테고리 1개를 선택해줘. 전혀 관련이 없으면 category를 null로 지정해.
                반드시 다른 설명 없이 아래 JSON 형식으로만 응답해.
                {
                  "category": "선택한_카테고리명_또는_null",
                  "confidence": 0.0에서 1.0 사이의_실수
                }
                """, query, availableCategories);

        Map<String, Object> requestBody = Map.of(
                "model", model,
                "max_tokens", 1024,
                "output_config", Map.of("effort", "low"),
                "fallbacks", "default",
                "messages", List.of(Map.of("role", "user", "content", prompt)));

        String jsonBody = objectMapper.writeValueAsString(requestBody);

        HttpClient httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();

        HttpRequest httpRequest = HttpRequest.newBuilder()
                .uri(URI.create(apiUrl))
                .timeout(Duration.ofSeconds(15))
                .header("Content-Type", "application/json")
                .header("x-api-key", apiKey)
                .header("anthropic-version", "2023-06-01")
                .header("anthropic-beta", "server-side-fallback-2026-07-01")
                .POST(HttpRequest.BodyPublishers.ofString(jsonBody, StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> httpResponse = httpClient.send(httpRequest,
                HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (httpResponse.statusCode() != 200) {
            throw new IllegalStateException("Claude HTTP " + httpResponse.statusCode() + ": " + httpResponse.body());
        }

        return parseClaudeResponse(query, httpResponse.body());
    }

    private CategoryResolveResponse parseClaudeResponse(String query, String rawResponse) {
        try {
            JsonNode root = objectMapper.readTree(rawResponse);
            if (!"end_turn".equals(root.path("stop_reason").asText())) {
                log.warn("Claude 응답 비정상 종료: {}", root.path("stop_reason").asText());
                return null;
            }

            JsonNode contentArray = root.path("content");
            if (!contentArray.isArray() || contentArray.isEmpty()) {
                return null;
            }

            String text = "";
            for (JsonNode block : contentArray) {
                if ("text".equals(block.path("type").asText())) {
                    text = block.path("text").asText("").trim();
                    break;
                }
            }
            if (text.isEmpty()) {
                return null;
            }
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

            return CategoryResolveResponse.builder()
                    .query(query)
                    .category(category.toUpperCase())
                    .confidence(confidence)
                    .method("AI")
                    .build();
        } catch (Exception e) {
            log.warn("Claude 응답 파싱 실패: {}", e.getMessage());
            return null;
        }
    }
}
