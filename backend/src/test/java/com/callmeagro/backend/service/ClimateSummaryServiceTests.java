package com.callmeagro.backend.service;

import com.callmeagro.backend.dto.ClimateResponse;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class ClimateSummaryServiceTests {
    private NasaPowerService nasa;
    private ClimateSummaryService service;
    private final LocalDate start = LocalDate.of(2025, 1, 1);

    @BeforeEach
    void setup() {
        nasa = mock(NasaPowerService.class);
        service = new ClimateSummaryService(nasa);
    }

    private void given(List<ClimateResponse.Day> days, String status, Map<String, String> units) {
        when(nasa.fetch(31, 74)).thenReturn(new ClimateResponse(31, 74,
                new ClimateResponse.Period(start, start.plusDays(days.size() - 1)),
                "UTC", "NASA POWER", "https://power.larc.nasa.gov/api/temporal/daily/point",
                status, !status.equals("COMPLETE"), units, days));
    }

    private Map<String, String> units() {
        return Map.of("temperature", "C", "precipitation", "mm/day",
                "relativeHumidity", "%", "solarRadiation", "MJ/m^2/day");
    }

    @Test
    void calculatesKnownValuesAndFetchesOnce() {
        given(List.of(new ClimateResponse.Day(start, 10.0, 1.0, 40.0, 10.0),
                new ClimateResponse.Day(start.plusDays(1), 20.0, 2.0, 60.0, 14.0)), "COMPLETE", units());
        var result = service.fetch(31, 74);
        assertEquals(15.0, result.temperature().average());
        assertEquals(10.0, result.temperature().minimumTemperature());
        assertEquals(20.0, result.temperature().maximumTemperature());
        assertTrue(result.temperature().basis().contains("NASA T2M"));
        assertEquals(3.0, result.precipitation().totalPrecipitation());
        assertEquals("mm", result.precipitation().unit());
        assertTrue(result.precipitation().completePeriod());
        assertEquals(50.0, result.relativeHumidity().average());
        assertEquals(12.0, result.solarRadiation().average());
        assertEquals(2, result.expectedDays());
        assertEquals(2, result.temperature().validDays());
        assertEquals("COMPLETE", result.dataStatus());
        assertEquals("UTC", result.timeStandard());
        assertEquals("NASA POWER", result.source());
        verify(nasa).fetch(31, 74);
        verifyNoMoreInteractions(nasa);
    }

    @Test
    void missingDaysAreExcludedIndependentlyAndRainIsPartial() {
        given(List.of(new ClimateResponse.Day(start, -10.0, null, 40.0, null),
                new ClimateResponse.Day(start.plusDays(1), null, 2.0, 60.0, 14.0)), "PARTIAL", units());
        var result = service.fetch(31, 74);
        assertEquals(-10.0, result.temperature().average());
        assertEquals(-10.0, result.temperature().minimumTemperature());
        assertEquals(-10.0, result.temperature().maximumTemperature());
        assertEquals(1, result.temperature().validDays());
        assertEquals(2.0, result.precipitation().totalPrecipitation());
        assertEquals(1, result.precipitation().validDays());
        assertFalse(result.precipitation().completePeriod());
        assertTrue(result.precipitation().basis().contains("available daily precipitation only"));
        assertEquals(50.0, result.relativeHumidity().average());
        assertEquals(2, result.relativeHumidity().validDays());
        assertEquals(14.0, result.solarRadiation().average());
        assertEquals(1, result.solarRadiation().validDays());
        assertEquals("PARTIAL", result.dataStatus());
        assertTrue(result.hasMissingData());
    }

    @Test
    void allMissingReturnsNullStatisticsNotZero() {
        given(List.of(new ClimateResponse.Day(start, null, null, null, null)), "NO_VALID_DATA", units());
        var result = service.fetch(31, 74);
        assertNull(result.temperature().average());
        assertNull(result.temperature().minimumTemperature());
        assertNull(result.temperature().maximumTemperature());
        assertNull(result.precipitation().totalPrecipitation());
        assertNull(result.relativeHumidity().average());
        assertNull(result.solarRadiation().average());
        assertEquals(0, result.precipitation().validDays());
        assertFalse(result.precipitation().completePeriod());
        assertEquals("NO_VALID_DATA", result.dataStatus());
    }

    @Test
    void missingRainDoesNotDiscardOtherParameters() {
        given(List.of(new ClimateResponse.Day(start, 10.0, null, 40.0, 10.0)), "PARTIAL", units());
        var result = service.fetch(31, 74);
        assertNull(result.precipitation().totalPrecipitation());
        assertEquals(10.0, result.temperature().average());
        assertEquals(40.0, result.relativeHumidity().average());
        assertEquals(10.0, result.solarRadiation().average());
    }

    @Test
    void actualZeroRainIsZero() {
        given(List.of(new ClimateResponse.Day(start, -2.0, 0.0, 40.0, 10.0)), "COMPLETE", units());
        var result = service.fetch(31, 74);
        assertEquals(0.0, result.precipitation().totalPrecipitation());
        assertTrue(result.precipitation().completePeriod());
        assertEquals(-2.0, result.temperature().average());
    }

    @Test
    void unsupportedPrecipitationUnitFailsRatherThanMislabels() {
        given(List.of(new ClimateResponse.Day(start, 10.0, 1.0, 40.0, 10.0)), "COMPLETE",
                Map.of("precipitation", "inches/day"));
        var ex = assertThrows(ResponseStatusException.class, () -> service.fetch(31, 74));
        assertEquals(502, ex.getStatusCode().value());
    }
}
