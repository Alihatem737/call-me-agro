package com.callmeagro.backend.dto;

public record ClimateSummaryResponse(double latitude, double longitude, ClimateResponse.Period period,
        String timeStandard, String source, String sourceUrl, String dataStatus,
        boolean hasMissingData, long expectedDays, Temperature temperature,
        Precipitation precipitation, Average relativeHumidity, Average solarRadiation) {
    public record Temperature(Double average, Double minimumTemperature, Double maximumTemperature,
            String basis, String unit, long validDays) {}
    public record Precipitation(Double totalPrecipitation, String basis, boolean completePeriod,
            String unit, long validDays) {}
    public record Average(Double average, String unit, long validDays) {}
}
