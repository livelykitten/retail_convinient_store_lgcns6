package com.lgcns.retail.product.controller;

import com.lgcns.retail.product.dto.ProductDto;
import com.lgcns.retail.product.service.ProductService;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/products")
public class ProductController {

    private final ProductService productService;

    @GetMapping
    public List<ProductDto> getProducts(@RequestParam(required = false) String category) {
        if (category == null || category.isBlank()) {
            return productService.findAll();
        }
        return productService.findByCategory(category);
    }
}
