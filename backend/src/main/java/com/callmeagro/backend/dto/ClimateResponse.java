package com.callmeagro.backend.dto;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public record ClimateResponse(double latitude, double longitude, Period period,
        String timeStandard, String source, String sourceUrl, String dataStatus,
        boolean hasMissingData, Map<String, String> units, List<Day> daily) {
    public record Period(LocalDate start, LocalDate end) {}
    public record Day(LocalDate date, Double temperature, Double precipitation,
            Double relativeHumidity, Double solarRadiation) {}
}
