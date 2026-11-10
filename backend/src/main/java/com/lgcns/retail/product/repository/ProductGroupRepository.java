package com.lgcns.retail.product.repository;

import com.lgcns.retail.product.entity.ProductGroup;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductGroupRepository extends JpaRepository<ProductGroup, String> {
}
