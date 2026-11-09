package com.lgcns.retail.product.repository;

import com.lgcns.retail.product.entity.Product;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ProductRepository extends JpaRepository<Product, String> {

    List<Product> findByProductGroup_Category(String category);
}
