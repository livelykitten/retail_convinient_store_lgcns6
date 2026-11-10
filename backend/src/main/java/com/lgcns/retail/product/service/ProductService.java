package com.lgcns.retail.product.service;

import java.util.List;
import com.lgcns.retail.product.dto.ProductDto;

public interface ProductService {
    
    List <ProductDto> findAll();

    List<ProductDto> findByCategory(String category);
}
