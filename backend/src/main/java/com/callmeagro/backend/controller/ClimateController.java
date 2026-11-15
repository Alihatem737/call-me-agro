package com.callmeagro.backend.controller;

import com.callmeagro.backend.dto.ClimateResponse;
import com.callmeagro.backend.dto.PlantingClimateResponse;
import com.callmeagro.backend.service.PlantingClimateService;
import org.springframework.format.annotation.DateTimeFormat;
import java.time.LocalDate;
import com.callmeagro.backend.dto.ClimateSummaryResponse;
import com.callmeagro.backend.service.ClimateSummaryService;
import com.callmeagro.backend.service.NasaPowerService;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@RestController
public class ClimateController {
    private final NasaPowerService service;
    private final ClimateSummaryService summaryService;
    private final PlantingClimateService plantingService;

    public ClimateController(NasaPowerService service, ClimateSummaryService summaryService,
            PlantingClimateService plantingService) {
        this.service = service;
        this.summaryService = summaryService;
        this.plantingService = plantingService;
    }

    @GetMapping("/api/climate")
    public ClimateResponse climate(@RequestParam double latitude, @RequestParam double longitude) {
        validateCoordinates(latitude, longitude);
        return service.fetch(latitude, longitude);
    }

    @GetMapping("/api/climate/summary")
    public ClimateSummaryResponse summary(@RequestParam double latitude, @RequestParam double longitude) {
        validateCoordinates(latitude, longitude);
        return summaryService.fetch(latitude, longitude);
    }

    @GetMapping("/api/climate/planting-summary")
    public PlantingClimateResponse plantingSummary(@RequestParam double latitude, @RequestParam double longitude,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate startDate,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate endDate) {
        validateCoordinates(latitude, longitude);
        return plantingService.fetch(latitude, longitude, startDate, endDate);
    }

    private void validateCoordinates(double latitude, double longitude) {
        if (!Double.isFinite(latitude) || latitude < -90 || latitude > 90
                || !Double.isFinite(longitude) || longitude < -180 || longitude > 180) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid latitude or longitude.");
        }
    }
}
