package com.lgcns.retail.store.rode;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;


import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import lombok.RequiredArgsConstructor;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/routes/walking")
public class WalkingRouteController {

    private final WalkingRouteService walkingRouteService;

    @GetMapping
    public WalkingRoute findRoute(
            @RequestParam @DecimalMin("-180") @DecimalMax("180") double startX,
            @RequestParam @DecimalMin("-90") @DecimalMax("90") double startY,
            @RequestParam @DecimalMin("-180") @DecimalMax("180") double endX,
            @RequestParam @DecimalMin("-90") @DecimalMax("90") double endY) {
        return walkingRouteService.findRoute(startX, startY, endX, endY);
    }
}
