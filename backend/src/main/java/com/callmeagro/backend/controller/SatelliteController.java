package com.callmeagro.backend.controller;

import com.callmeagro.backend.dto.SatelliteRequest;
import com.callmeagro.backend.dto.SatelliteResponse;
import com.callmeagro.backend.service.SatelliteMonitoringService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/satellite")
@CrossOrigin(origins = "http://localhost:4200")
public class SatelliteController {
    private final SatelliteMonitoringService service;
    public SatelliteController(SatelliteMonitoringService service) { this.service = service; }

    @PostMapping("/field-analysis")
    public SatelliteResponse analysis(@RequestBody SatelliteRequest request) {
        return service.process(request, "analysis");
    }

    @PostMapping("/vegetation-history")
    public SatelliteResponse history(@RequestBody SatelliteRequest request) {
        return service.process(request, "history");
    }

    @PostMapping("/available-dates")
    public SatelliteResponse dates(@RequestBody SatelliteRequest request) {
        return service.process(request, "dates");
    }
}
