package com.callmeagro.backend.controller;

import com.callmeagro.backend.dto.ClimateResponse;
import com.callmeagro.backend.dto.ClimateSummaryResponse;
import com.callmeagro.backend.service.ClimateSummaryService;
import com.callmeagro.backend.service.PlantingClimateService;
import com.callmeagro.backend.dto.PlantingClimateResponse;
import com.callmeagro.backend.exception.ClimateExceptionHandler;
import com.callmeagro.backend.service.NasaPowerService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class ClimateControllerTests {
    private NasaPowerService service;
    private ClimateSummaryService summaryService;
    private PlantingClimateService plantingService;
    private MockMvc mvc;

    @BeforeEach
    void setup() {
        service = mock(NasaPowerService.class);
        summaryService = mock(ClimateSummaryService.class);
        plantingService = mock(PlantingClimateService.class);
        mvc = MockMvcBuilders.standaloneSetup(new ClimateController(service, summaryService, plantingService))
                .setControllerAdvice(new ClimateExceptionHandler()).build();
    }

    @ParameterizedTest
    @ValueSource(strings = {"latitude=91&longitude=0", "latitude=0&longitude=-181",
            "latitude=NaN&longitude=0", "latitude=0&longitude=Infinity",
            "latitude=abc&longitude=0", "latitude=0", "longitude=0"})
    void invalidCoordinatesDoNotCallNasa(String query) throws Exception {
        mvc.perform(get("/api/climate?" + query)).andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
        verifyNoInteractions(service);
    }

    @Test
    void noValidDataIsSuccessfulAndExplicit() throws Exception {
        var date = LocalDate.of(2025, 1, 1);
        when(service.fetch(0, 0)).thenReturn(new ClimateResponse(0, 0,
                new ClimateResponse.Period(date, date), "UTC", "NASA POWER", "https://power.larc.nasa.gov",
                "NO_VALID_DATA", true, Map.of("temperature", "C"),
                List.of(new ClimateResponse.Day(date, null, null, null, null))));
        mvc.perform(get("/api/climate?latitude=0&longitude=0")).andExpect(status().isOk())
                .andExpect(jsonPath("$.dataStatus").value("NO_VALID_DATA"))
                .andExpect(jsonPath("$.hasMissingData").value(true))
                .andExpect(jsonPath("$.period.start").value("2025-01-01"));
    }

    @ParameterizedTest
    @ValueSource(ints = {502, 504})
    void upstreamFailuresKeepTheirStatus(int statusCode) throws Exception {
        when(service.fetch(0, 0)).thenThrow(new ResponseStatusException(
                HttpStatus.valueOf(statusCode), "NASA failure"));
        mvc.perform(get("/api/climate?latitude=0&longitude=0"))
                .andExpect(status().is(statusCode)).andExpect(jsonPath("$.detail").value("NASA failure"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"latitude=91&longitude=0", "latitude=0&longitude=-181",
            "latitude=NaN&longitude=0", "latitude=0&longitude=Infinity",
            "latitude=abc&longitude=0", "latitude=0", "longitude=0"})
    void invalidSummaryCoordinatesDoNotCallNasa(String query) throws Exception {
        mvc.perform(get("/api/climate/summary?" + query)).andExpect(status().isBadRequest());
        verifyNoInteractions(summaryService, service);
    }

    @Test
    void summaryReturnsContractAndMissingValues() throws Exception {
        var date = LocalDate.of(2025, 1, 1);
        when(summaryService.fetch(0, 0)).thenReturn(new ClimateSummaryResponse(0, 0,
                new ClimateResponse.Period(date, date), "UTC", "NASA POWER", "https://power.larc.nasa.gov",
                "NO_VALID_DATA", true, 1,
                new ClimateSummaryResponse.Temperature(null, null, null, "NASA T2M daily means", "C", 0),
                new ClimateSummaryResponse.Precipitation(null, "Available days only", false, "mm", 0),
                new ClimateSummaryResponse.Average(null, "%", 0),
                new ClimateSummaryResponse.Average(null, "MJ/m^2/day", 0)));
        mvc.perform(get("/api/climate/summary?latitude=0&longitude=0")).andExpect(status().isOk())
                .andExpect(jsonPath("$.dataStatus").value("NO_VALID_DATA"))
                .andExpect(jsonPath("$.expectedDays").value(1))
                .andExpect(jsonPath("$.temperature.minimumTemperature").doesNotExist())
                .andExpect(jsonPath("$.temperature.basis").value("NASA T2M daily means"))
                .andExpect(jsonPath("$.precipitation.completePeriod").value(false))
                .andExpect(jsonPath("$.precipitation.unit").value("mm"));
        verify(summaryService).fetch(0, 0);
        verifyNoInteractions(service);
    }

    @ParameterizedTest
    @ValueSource(ints = {502, 504})
    void summaryUpstreamFailuresKeepTheirStatus(int statusCode) throws Exception {
        when(summaryService.fetch(0, 0)).thenThrow(new ResponseStatusException(
                HttpStatus.valueOf(statusCode), "NASA failure"));
        mvc.perform(get("/api/climate/summary?latitude=0&longitude=0"))
                .andExpect(status().is(statusCode)).andExpect(jsonPath("$.detail").value("NASA failure"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"startDate=2025-02-29&endDate=2025-03-01",
            "startDate=2025-02-30&endDate=2025-03-01", "startDate=bad&endDate=2025-03-01",
            "startDate=2025-01-01", "endDate=2025-01-01", ""})
    void invalidPlantingDatesAre400(String query) throws Exception {
        mvc.perform(get("/api/climate/planting-summary?latitude=0&longitude=0&" + query))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.detail").value("Provide both startDate and endDate as valid YYYY-MM-DD calendar dates."));
        verifyNoInteractions(plantingService, service, summaryService);
    }

    @Test
    void invalidPlantingCoordinatesAre400() throws Exception {
        mvc.perform(get("/api/climate/planting-summary?latitude=NaN&longitude=0&startDate=2025-01-01&endDate=2025-01-02"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(plantingService);
    }

    @Test
    void plantingMetadataPreservesRequestedDates() throws Exception {
        var start = LocalDate.of(2028, 2, 29);
        when(plantingService.fetch(0, 0, start, start)).thenReturn(new PlantingClimateResponse(
                new ClimateResponse.Period(start, start), 1, "HISTORICAL_ESTIMATE", false,
                "Single comparable historical period; not a forecast.", null));
        mvc.perform(get("/api/climate/planting-summary?latitude=0&longitude=0&startDate=2028-02-29&endDate=2028-02-29"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.requestedPeriod.start").value("2028-02-29"))
                .andExpect(jsonPath("$.dataMode").value("HISTORICAL_ESTIMATE"))
                .andExpect(jsonPath("$.isForecast").value(false));
        verify(plantingService).fetch(0, 0, start, start);
        verifyNoInteractions(service, summaryService);
    }

    @ParameterizedTest
    @ValueSource(ints = {400, 422, 502, 504})
    void plantingErrorsKeepTheirStatus(int status) throws Exception {
        var date = LocalDate.of(2025, 1, 1);
        when(plantingService.fetch(0, 0, date, date)).thenThrow(new ResponseStatusException(
                HttpStatus.valueOf(status), "Planting error"));
        mvc.perform(get("/api/climate/planting-summary?latitude=0&longitude=0&startDate=2025-01-01&endDate=2025-01-01"))
                .andExpect(status().is(status)).andExpect(jsonPath("$.detail").value("Planting error"));
    }
}
