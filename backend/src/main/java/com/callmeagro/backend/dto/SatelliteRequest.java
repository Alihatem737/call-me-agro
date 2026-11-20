package com.callmeagro.backend.dto;

import java.time.LocalDate;
import java.util.List;

public record SatelliteRequest(Boundary boundary, String indicator, LocalDate date,
        LocalDate startDate, LocalDate endDate) {
    public record Boundary(String type, List<List<List<Double>>> coordinates) {}
}
