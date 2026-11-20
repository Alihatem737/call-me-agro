package com.callmeagro.backend.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public record SatelliteResponse(String status, String indicator, String units, int resolutionMeters,
        double fieldAreaSquareMeters, String limitations, List<Observation> observations) {
    public record Observation(String id, String collection, String source, String observedAt,
            LocalDate date, String status, Double tileCloudCoverPercent, int fieldPixels,
            int validPixels, int cloudPixels, double validPixelFraction, Statistics statistics,
            Layer layer) {}
    public record Statistics(double mean, double minimum, double maximum, double median) {}
    public record Layer(String type, List<Feature> features) {}
    public record Feature(String type, SatelliteRequest.Boundary geometry, Map<String, Double> properties) {}
}
