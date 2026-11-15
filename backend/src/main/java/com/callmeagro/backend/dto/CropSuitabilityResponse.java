package com.callmeagro.backend.dto;

import java.util.List;

public record CropSuitabilityResponse(String assessmentScope, String assessmentBasis,
        String rulesVersion, String limitations, PlantingClimateResponse climate, List<Crop> crops) {
    public record Crop(String id, String name, String suitability, String detail,
            TemperatureEvidence temperatureEvidence, ReferenceRange referenceRange) {}
    public record TemperatureEvidence(long validDays, long missingDays, long belowRangeDays,
            long withinRangeDays, long aboveRangeDays) {}
    public record ReferenceRange(double minimum, double maximum, String unit,
            String basis, List<Source> sources) {}
    public record Source(String title, String url) {}
}
