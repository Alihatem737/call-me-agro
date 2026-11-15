package com.callmeagro.backend.service;

import com.callmeagro.backend.dto.CropSuitabilityRequest;
import com.callmeagro.backend.dto.CropSuitabilityResponse;
import com.callmeagro.backend.dto.ClimateResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;

@Service
public class CropSuitabilityService {
    private final PlantingClimateService planting;

    public CropSuitabilityService(PlantingClimateService planting) {
        this.planting = planting;
    }

    public CropSuitabilityResponse assess(CropSuitabilityRequest request) {
        if (request.latitude() == null || request.longitude() == null
                || !Double.isFinite(request.latitude()) || Math.abs(request.latitude()) > 90
                || !Double.isFinite(request.longitude()) || Math.abs(request.longitude()) > 180) {
            throw invalid("Provide valid latitude (-90 to 90) and longitude (-180 to 180).");
        }
        var window = request.plantingWindow();
        if (window == null || window.from() == null || window.to() == null || !window.to().isAfter(window.from())) {
            throw invalid("Provide a plantingWindow with valid from and to dates; to must be after from.");
        }
        var ids = request.comparisonCrops();
        if (ids == null || ids.isEmpty() || ids.size() > 6 || new HashSet<>(ids).size() != ids.size()
                || ids.stream().anyMatch(id -> CropClimateRules.find(id) == null)) {
            throw invalid("Provide 1 to 6 unique crop IDs: potato, tomato, onion, pepper, cucumber, carrot.");
        }
        var loaded = planting.load(request.latitude(), request.longitude(), window.from(), window.to());
        if (!"C".equals(loaded.daily().units().get("temperature"))) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "NASA POWER returned an unsupported temperature unit.");
        }
        var crops = ids.stream().map(id -> compare(CropClimateRules.find(id), loaded.daily().daily(),
                loaded.response().requestedDays(), loaded.daily().period())).toList();
        return new CropSuitabilityResponse("PLANTING_WINDOW_AIR_TEMPERATURE",
                "Preliminary air-temperature comparison during the planting start window only.",
                CropClimateRules.VERSION,
                "Not a final planting recommendation or guarantee of crop success. Historical data are not forecasts. "
                        + "One historical period is not a multi-year climate normal. Soil readiness, nighttime extremes, "
                        + "irrigation, cultivar, protected cultivation and the full growing season are not assessed. "
                        + "Reference ranges are general guidance, not locally validated success or damage thresholds.",
                loaded.response(), crops);
    }

    private CropSuitabilityResponse.Crop compare(CropClimateRules.Rule rule, List<ClimateResponse.Day> days,
            long expectedDays, ClimateResponse.Period period) {
        long below = 0;
        long within = 0;
        long above = 0;
        for (var day : days) {
            Double temperature = day.temperature();
            if (temperature == null || !Double.isFinite(temperature)) continue;
            if (temperature < rule.range().minimum()) below++;
            else if (temperature > rule.range().maximum()) above++;
            else within++;
        }
        long valid = below + within + above;
        long missing = expectedDays - valid;
        String label;
        if (valid == 0) label = "Insufficient temperature data";
        else if (missing > 0) label = "Limited temperature data";
        else if (within == valid) label = "Within reference range";
        else if (below == valid) label = "Cooler than reference";
        else if (above == valid) label = "Warmer than reference";
        else label = "Variable temperatures";
        String detail = String.format(Locale.ROOT,
                "Preliminary air-temperature comparison for the planting start window only. "
                        + "Historical NASA period %s to %s: %d valid days; %d below, %d within and %d above "
                        + "the %.2f-%.2f C reference; %d missing days. "
                        + "Uses daily mean T2M, not soil or nighttime temperature. "
                        + "Not a forecast, final planting recommendation or guarantee of success.",
                period.start(), period.end(), valid, below, within, above,
                rule.range().minimum(), rule.range().maximum(), missing);
        return new CropSuitabilityResponse.Crop(rule.id(), rule.name(), "Preliminary: " + label, detail,
                new CropSuitabilityResponse.TemperatureEvidence(valid, missing, below, within, above), rule.range());
    }

    private ResponseStatusException invalid(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
