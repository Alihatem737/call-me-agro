package com.callmeagro.backend.dto;

public record PlantingClimateResponse(ClimateResponse.Period requestedPeriod, long requestedDays,
        String dataMode, boolean isForecast, String method, ClimateSummaryResponse summary) {}
