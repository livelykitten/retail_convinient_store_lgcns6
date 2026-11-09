package com.lgcns.retail.aiservice.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Getter
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CategoryResolveResponse {
    private String category;
    private Double confidence;
    private String method;
}

