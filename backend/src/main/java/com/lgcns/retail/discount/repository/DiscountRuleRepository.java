package com.lgcns.retail.discount.repository;

import com.lgcns.retail.common.Brand;
import com.lgcns.retail.discount.entity.DiscountRule;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface DiscountRuleRepository extends JpaRepository<DiscountRule, String> {

    List<DiscountRule> findByBrand(Brand brand);
}
