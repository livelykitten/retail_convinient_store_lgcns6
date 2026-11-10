package com.lgcns.retail.discount.loader;

import com.lgcns.retail.common.Brand;
import com.lgcns.retail.discount.entity.CardIssuer;
import com.lgcns.retail.discount.entity.CardProduct;
import com.lgcns.retail.discount.entity.DiscountRule;
import com.lgcns.retail.discount.entity.MethodType;
import com.lgcns.retail.discount.entity.RuleKind;
import com.lgcns.retail.discount.entity.TelecomGrade;
import com.lgcns.retail.discount.repository.CardProductRepository;
import com.lgcns.retail.discount.repository.DiscountRuleRepository;
import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * 앱이 뜰 때 할인 규칙표 CSV를 다시 적재한다. 형식은 docs/reference/discount-rule-csv.md.
 * card_product 먼저 (discount_rule.card_id가 가리킴).
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DiscountCsvLoader implements CommandLineRunner {

    private static final String CARD_CSV_PATH = "data/card_product.csv";
    private static final String RULE_CSV_PATH = "data/discount_rule.csv";

    private final CardProductRepository cardProductRepository;
    private final DiscountRuleRepository discountRuleRepository;

    @Override
    public void run(String... args) throws Exception {
        discountRuleRepository.deleteAll();
        cardProductRepository.deleteAll();

        List<CardProduct> cards = readCsv(CARD_CSV_PATH).stream().map(this::toCard).toList();
        cardProductRepository.saveAll(cards);

        List<DiscountRule> rules = readCsv(RULE_CSV_PATH).stream().map(this::toRule).toList();
        discountRuleRepository.saveAll(rules);

        log.info("할인 규칙 적재 완료: 카드 상품 {}건, 규칙 {}건", cards.size(), rules.size());
    }

    // card_id,name,issuer
    private CardProduct toCard(String[] c) {
        return CardProduct.builder()
                .cardId(c[0])
                .name(c[1])
                .issuer(CardIssuer.valueOf(c[2]))
                .build();
    }

    // rule_id,type,provider,grade,card_id,brand,kind,rate,max_amount,min_pay_amount,
    // stack_with_event,requires_prev_month,source,checked_at
    private DiscountRule toRule(String[] c) {
        return DiscountRule.builder()
                .ruleId(c[0])
                .type(MethodType.valueOf(c[1]))
                .provider(c[2])
                .grade(c[3].isBlank() ? null : TelecomGrade.valueOf(c[3]))
                .cardId(blankToNull(c[4]))
                .brand(Brand.valueOf(c[5]))
                .kind(RuleKind.valueOf(c[6]))
                .rate(new BigDecimal(c[7]))
                .maxAmount(c[8].isBlank() ? null : Integer.valueOf(c[8]))
                .minPayAmount(c[9].isBlank() ? null : Integer.valueOf(c[9]))
                .stackWithEvent(Boolean.parseBoolean(c[10]))
                .requiresPrevMonth(Boolean.parseBoolean(c[11]))
                .source(blankToNull(c[12]))
                .checkedAt(c[13].isBlank() ? null : LocalDate.parse(c[13]))
                .build();
    }

    /** 첫 줄(헤더)과 빈 줄은 건너뛴다 */
    private List<String[]> readCsv(String path) throws IOException {
        List<String[]> rows = new ArrayList<>();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(
                new ClassPathResource(path).getInputStream(), StandardCharsets.UTF_8))) {
            String line;
            int lineNo = 0;
            while ((line = reader.readLine()) != null) {
                lineNo++;
                if (lineNo == 1 || line.isBlank()) {
                    continue;
                }
                rows.add(splitCsvLine(line));
            }
        }
        return rows;
    }

    /**
     * 큰따옴표로 감싼 값 안의 쉼표와 BOM을 처리한다.
     * product 모듈의 ProductCsvLoader와 같은 규칙. common에 옮기는 것은 이서현 님과 상의 후 (확인 요망)
     */
    static String[] splitCsvLine(String line) {
        List<String> cells = new ArrayList<>();
        StringBuilder cell = new StringBuilder();
        boolean quoted = false;
        for (int i = 0; i < line.length(); i++) {
            char ch = line.charAt(i);
            if (quoted) {
                if (ch == '"' && i + 1 < line.length() && line.charAt(i + 1) == '"') {
                    cell.append('"');
                    i++;
                } else if (ch == '"') {
                    quoted = false;
                } else {
                    cell.append(ch);
                }
            } else if (ch == '"') {
                quoted = true;
            } else if (ch == ',') {
                cells.add(cell.toString());
                cell.setLength(0);
            } else if (ch != '﻿') {
                cell.append(ch);
            }
        }
        cells.add(cell.toString());
        return cells.toArray(String[]::new);
    }

    private static String blankToNull(String value) {
        return value.isBlank() ? null : value;
    }
}
