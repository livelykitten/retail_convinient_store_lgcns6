package com.lgcns.retail.product.repository;

import com.lgcns.retail.product.entity.Product;
import java.util.List;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductRepository extends JpaRepository<Product, String> {

    // ProductDto가 상품 묶음(이름 · 이미지 · 상품군)을 읽으므로 한 번에 가져온다 (상품 수만큼 쿼리가 나가지 않게)
    @Override
    @EntityGraph(attributePaths = "productGroup")
    List<Product> findAll();

    @EntityGraph(attributePaths = "productGroup")
    List<Product> findByProductGroup_Category(String category);
}
