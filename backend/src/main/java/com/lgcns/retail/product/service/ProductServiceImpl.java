package com.lgcns.retail.product.service;

import com.lgcns.retail.common.error.BusinessException;
import com.lgcns.retail.common.error.ErrorCode;
import com.lgcns.retail.product.dto.ProductDto;
import com.lgcns.retail.product.repository.ProductRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class ProductServiceImpl implements ProductService {

    private final ProductRepository productRepository;

    @Override
    public List<ProductDto> findAll() {
        return productRepository.findAll().stream()
                .map(ProductDto::from)
                .toList();
    }

    @Override
    public List<ProductDto> findByCategory(String category) {
        if (category == null || category.isBlank()) {
            throw new BusinessException(ErrorCode.INVALID_PARAM);
        }
        return productRepository.findByProductGroup_Category(category).stream()
                .map(ProductDto::from)
                .toList();
    }
}
