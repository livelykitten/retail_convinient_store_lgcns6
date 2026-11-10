package com.lgcns.retail.store.controller;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.lgcns.retail.store.dto.Store;
import com.lgcns.retail.store.service.StoreService;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/stores")
public class StoreController {

    private final StoreService storeService;
    // 4-3 api명세서ㅏ 
    @GetMapping
    public List<Store> findNearby(
            @RequestParam double x,
            @RequestParam double y,
            @RequestParam(defaultValue = "500") @Min(1) @Max(2000) int radius) {
        return storeService.findNearbyWithWalkMin(x, y, radius);
    }
}
