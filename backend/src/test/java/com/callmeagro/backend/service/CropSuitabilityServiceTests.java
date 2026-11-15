package com.callmeagro.backend.service;

import com.callmeagro.backend.dto.ClimateResponse;
import com.callmeagro.backend.dto.CropSuitabilityRequest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class CropSuitabilityServiceTests {
    private final NasaPowerService nasa = mock(NasaPowerService.class);
    private final PlantingClimateService planting = new PlantingClimateService(nasa, new ClimateSummaryService(nasa),
            Clock.fixed(Instant.parse("2026-11-15T00:00:00Z"), ZoneOffset.UTC));
    private final CropSuitabilityService service = new CropSuitabilityService(planting);
    private final LocalDate start = LocalDate.of(2025, 1, 1);

    private CropSuitabilityRequest request(List<String> ids, int days) {
        return new CropSuitabilityRequest(31.0, 74.0,
                new CropSuitabilityRequest.PlantingWindow(start, start.plusDays(days - 1)), ids);
    }

    private void data(LocalDate from, Double... temperatures) {
        var days = new ArrayList<ClimateResponse.Day>();
        for (int i = 0; i < temperatures.length; i++) {
            days.add(new ClimateResponse.Day(from.plusDays(i), temperatures[i], null, null, null));
        }
        var end = from.plusDays(days.size() - 1);
        when(nasa.fetch(31, 74, from, end)).thenReturn(new ClimateResponse(31, 74,
                new ClimateResponse.Period(from, end), "UTC", "NASA POWER", "https://power.larc.nasa.gov",
                "PARTIAL", true, Map.of("temperature", "C", "precipitation", "mm/day",
                "relativeHumidity", "%", "solarRadiation", "MJ/m^2/day"), days));
    }

    @ParameterizedTest
    @CsvSource({"potato,18,20", "tomato,60,80", "pepper,70,80", "cucumber,75,85", "carrot,60,65", "onion,55,75"})
    void exactBoundsAndEvidenceForEveryCrop(String id, double lower, double upper) {
        if (!id.equals("potato")) {
            lower = (lower - 32) * 5 / 9;
            upper = (upper - 32) * 5 / 9;
        }
        data(start, lower - 1, lower, (lower + upper) / 2, upper, upper + 1);
        var crop = service.assess(request(List.of(id), 5)).crops().get(0);
        assertEquals("Preliminary: Variable temperatures", crop.suitability());
        assertEquals(1, crop.temperatureEvidence().belowRangeDays());
        assertEquals(3, crop.temperatureEvidence().withinRangeDays());
        assertEquals(1, crop.temperatureEvidence().aboveRangeDays());
        assertEquals(0, crop.temperatureEvidence().missingDays());
        assertEquals(5, crop.temperatureEvidence().validDays());
        assertEquals(lower, crop.referenceRange().minimum());
        assertEquals(upper, crop.referenceRange().maximum());
        assertTrue(crop.detail().contains("planting start window only"));
        assertTrue(crop.detail().contains("Not a forecast"));
        assertFalse(crop.referenceRange().sources().isEmpty());
    }

    @Test
    void sourceMappingMatchesApprovedReferences() {
        assertEquals(2, CropClimateRules.find("potato").range().sources().size());
        assertTrue(CropClimateRules.find("onion").range().sources().get(0).url().contains("ucanr.edu"));
        for (String id : List.of("tomato", "pepper", "cucumber", "carrot")) {
            assertTrue(CropClimateRules.find(id).range().sources().get(0).url().contains("oregonstate.edu"));
        }
    }

    @ParameterizedTest
    @CsvSource({"10,Cooler than reference", "19,Within reference range", "30,Warmer than reference"})
    void completeTemperatureCanBeClassifiedWhenRainIsMissing(double value, String label) {
        data(start, value, value);
        var result = service.assess(request(List.of("potato"), 2));
        assertEquals("Preliminary: " + label, result.crops().get(0).suitability());
        assertEquals("PARTIAL", result.climate().summary().dataStatus());
        assertNull(result.climate().summary().precipitation().totalPrecipitation());
    }

    @Test
    void preservesAllSixCropOrderAndFetchesNasaOnlyOnce() {
        var ids = List.of("carrot", "pepper", "potato", "cucumber", "onion", "tomato");
        data(start, 10.0, 30.0);
        var result = service.assess(request(ids, 2));
        assertEquals(ids, result.crops().stream().map(crop -> crop.id()).toList());
        assertEquals("PLANTING_WINDOW_AIR_TEMPERATURE", result.assessmentScope());
        assertEquals(CropClimateRules.VERSION, result.rulesVersion());
        assertFalse(result.climate().isForecast());
        assertTrue(result.limitations().contains("Not a final planting recommendation"));
        verify(nasa).fetch(31, 74, start, start.plusDays(1));
        verifyNoMoreInteractions(nasa);
    }

    @Test
    void partialTemperatureKeepsAllAvailableCounts() {
        data(start, 10.0, 19.0, 30.0, null);
        var crop = service.assess(request(List.of("potato"), 4)).crops().get(0);
        assertEquals("Preliminary: Limited temperature data", crop.suitability());
        assertEquals(3, crop.temperatureEvidence().validDays());
        assertEquals(1, crop.temperatureEvidence().missingDays());
        assertEquals(1, crop.temperatureEvidence().belowRangeDays());
        assertEquals(1, crop.temperatureEvidence().withinRangeDays());
        assertEquals(1, crop.temperatureEvidence().aboveRangeDays());
    }

    @Test
    void noTemperatureDoesNotInventComparison() {
        data(start, null, null);
        var crop = service.assess(request(List.of("potato"), 2)).crops().get(0);
        assertEquals("Preliminary: Insufficient temperature data", crop.suitability());
        assertEquals(0, crop.temperatureEvidence().validDays());
        assertEquals(2, crop.temperatureEvidence().missingDays());
        assertEquals(0, crop.temperatureEvidence().withinRangeDays());
    }

    @Test
    void leapFuturePreservesHistoricalMetadataAndUsesOneRequest() {
        var requestedStart = LocalDate.of(2028, 2, 28);
        var actualStart = LocalDate.of(2024, 2, 28);
        data(actualStart, 10.0, 19.0, 30.0);
        var result = service.assess(new CropSuitabilityRequest(31.0, 74.0,
                new CropSuitabilityRequest.PlantingWindow(requestedStart, LocalDate.of(2028, 3, 1)), List.of("potato", "tomato")));
        assertEquals("HISTORICAL_ESTIMATE", result.climate().dataMode());
        assertEquals(actualStart, result.climate().summary().period().start());
        assertEquals(3, result.climate().requestedDays());
        assertTrue(result.crops().get(0).detail().contains("2024-02-28 to 2024-03-01"));
        verify(nasa).fetch(31, 74, actualStart, LocalDate.of(2024, 3, 1));
        verifyNoMoreInteractions(nasa);
    }

    @Test
    void invalidCropIdsAndCoordinatesNeverCallNasa() {
        for (var ids : List.of(List.<String>of(), List.of("potato", "potato"), List.of("Potato"),
                List.of("unknown"), Arrays.asList("potato", null))) {
            assertEquals(400, assertThrows(ResponseStatusException.class,
                    () -> service.assess(request(ids, 2))).getStatusCode().value());
        }
        var valid = request(List.of("potato"), 2);
        for (Double latitude : Arrays.asList(null, Double.NaN, Double.POSITIVE_INFINITY, 91.0)) {
            assertEquals(400, assertThrows(ResponseStatusException.class, () -> service.assess(
                    new CropSuitabilityRequest(latitude, 74.0, valid.plantingWindow(), valid.comparisonCrops()))).getStatusCode().value());
        }
        verifyNoInteractions(nasa);
    }

    @Test
    void sameDayWindowRejectedToMatchAngular() {
        assertEquals(400, assertThrows(ResponseStatusException.class,
                () -> service.assess(request(List.of("potato"), 1))).getStatusCode().value());
        verifyNoInteractions(nasa);
    }

    @ParameterizedTest
    @ValueSource(ints = {502, 504})
    void nasaFailuresPropagateWithoutFallback(int status) {
        when(nasa.fetch(31, 74, start, start.plusDays(1))).thenThrow(
                new ResponseStatusException(HttpStatus.valueOf(status), "NASA failure"));
        assertEquals(status, assertThrows(ResponseStatusException.class,
                () -> service.assess(request(List.of("potato"), 2))).getStatusCode().value());
        verify(nasa).fetch(31, 74, start, start.plusDays(1));
        verifyNoMoreInteractions(nasa);
    }
}
