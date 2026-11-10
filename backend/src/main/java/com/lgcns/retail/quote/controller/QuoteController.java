package com.lgcns.retail.quote.controller;

import com.lgcns.retail.quote.dto.QuoteRequest;
import com.lgcns.retail.quote.dto.QuoteResponse;
import com.lgcns.retail.quote.service.QuoteService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/quotes")
public class QuoteController {

    private final QuoteService quoteService;

    @PostMapping
    public QuoteResponse quote(@Valid @RequestBody QuoteRequest request) {
        return quoteService.quote(request);
    }
}
