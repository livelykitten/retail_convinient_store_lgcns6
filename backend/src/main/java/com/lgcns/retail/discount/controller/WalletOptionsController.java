package com.lgcns.retail.discount.controller;

import com.lgcns.retail.discount.dto.WalletOptionsResponse;
import com.lgcns.retail.discount.service.WalletOptionsService;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/wallet-options")
public class WalletOptionsController {

    private final WalletOptionsService walletOptionsService;

    @GetMapping
    public WalletOptionsResponse getWalletOptions() {
        return walletOptionsService.getOptions();
    }
}
