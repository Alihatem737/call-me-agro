package com.callmeagro.backend.controller;

import com.callmeagro.backend.dto.CropSuitabilityRequest;
import com.callmeagro.backend.dto.CropSuitabilityResponse;
import com.callmeagro.backend.service.CropSuitabilityService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.CrossOrigin;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class CropSuitabilityController {
    private final CropSuitabilityService service;

    public CropSuitabilityController(CropSuitabilityService service) {
        this.service = service;
    }

    @PostMapping("/api/crop-suitability")
    @CrossOrigin(origins = "http://localhost:4200")
    public CropSuitabilityResponse assess(@Valid @RequestBody CropSuitabilityRequest request) {
        return service.assess(request);
    }
}
