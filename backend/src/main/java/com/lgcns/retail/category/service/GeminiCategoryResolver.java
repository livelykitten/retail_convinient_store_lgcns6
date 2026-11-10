package com.lgcns.retail.category.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.lgcns.retail.category.dto.CategoryResolveResponse;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Primary;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Service
@Primary
public class GeminiCategoryResolver implements CategoryResolver {

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
            @Value("${gemini.api.url:https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent}") String apiUrl,
            KeywordCategoryResolver fallbackResolver,
            KeywordDictionary keywordDictionary) {
        this.apiKey = apiKey;
        this.apiUrl = apiUrl;
        this.fallbackResolver = fallbackResolver;
        this.keywordDictionary = keywordDictionary;
        this.restClient = RestClient.builder().build();
    }

    @Override
    public CategoryResolveResponse resolve(String q) {
        if (q == null || q.trim().isEmpty()) {
            return fallbackResolver.resolve(q);
        }

        String normalizedQuery = q.trim();

        // 캐시 확인 (같은 검색어 재사용)
        if (queryCache.containsKey(normalizedQuery)) {
            log.info("Gemini Category Cache Hit for query: {}", normalizedQuery);
            return queryCache.get(normalizedQuery);
        }

        // API Key 미설정 시 키워드 사전으로 Fallback
        if (apiKey == null || apiKey.isBlank()) {
            log.warn("Gemini API Key가 설정되지 않아 키워드 사전(KEYWORD)으로 대체합니다.");
            CategoryResolveResponse fallbackResult = fallbackResolver.resolve(normalizedQuery);
            queryCache.put(normalizedQuery, fallbackResult);
            return fallbackResult;
        }

        // Gemini API 호출
        try {
            CategoryResolveResponse response = callGemini(normalizedQuery);
            if (response != null && response.getCategory() != null) {
                queryCache.put(normalizedQuery, response);
                return response;
            }
        } catch (Exception e) {
            log.error("Gemini 호출 중 오류 발생: {}, 키워드 사전으로 폴백합니다.", e.getMessage());
        }

        // 호출 실패 또는 매칭 불가 시 Fallback
        CategoryResolveResponse fallbackResult = fallbackResolver.resolve(normalizedQuery);
        queryCache.put(normalizedQuery, fallbackResult);
        return fallbackResult;
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
                - 콜라, 제로콜라, 사이다, 탄산음료 -> COLA
                - 라면, 컵라면, 봉지라면 -> RAMEN
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

        String rawResponse = restClient.post()
                .uri(apiUrl + "?key=" + apiKey)
                .contentType(MediaType.APPLICATION_JSON)
                .body(requestBody)
                .retrieve()
                .body(String.class);

        return parseGeminiResponse(query, rawResponse);
    }

    private CategoryResolveResponse parseGeminiResponse(String query, String rawResponse) {
        try {
            JsonNode root = objectMapper.readTree(rawResponse);
            JsonNode textNode = root.path("candidates").get(0)
                    .path("content").path("parts").get(0).path("text");

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

            return CategoryResolveResponse.builder()
                    .query(query)
                    .category(category.toUpperCase())
                    .confidence(confidence)
                    .method("AI")
                    .build();
        } catch (Exception e) {
            log.warn("Gemini 응답 파싱 실패: {}", e.getMessage());
            return null;
        }
    }
}
