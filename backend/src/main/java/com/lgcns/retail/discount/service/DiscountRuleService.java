package com.lgcns.retail.discount.service;

import com.lgcns.retail.common.Brand;
import com.lgcns.retail.discount.dto.MatchedRule;
import com.lgcns.retail.discount.dto.Wallet;
import java.util.List;

/** 모듈 간 인터페이스 (design.md: DiscountRuleService.findFor, 주인 함석원) */
public interface DiscountRuleService {

    /** 이 브랜드에서 사용자 할인 수단에 맞는 할인 · 적립 규칙 전부 (erd.md 5-2 "규칙 찾는 법") */
    List<MatchedRule> findFor(Wallet wallet, Brand brand);
}
