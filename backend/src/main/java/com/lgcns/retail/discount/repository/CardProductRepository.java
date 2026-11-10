package com.lgcns.retail.discount.repository;

import com.lgcns.retail.discount.entity.CardProduct;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CardProductRepository extends JpaRepository<CardProduct, String> {
}
