package com.callmeagro.backend.service;

import com.callmeagro.backend.dto.ClimateResponse;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.web.server.ResponseStatusException;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class PlantingClimateServiceTests {
    private final NasaPowerService nasa = mock(NasaPowerService.class);
    private final ClimateSummaryService summaries = new ClimateSummaryService(nasa);
    private final Clock clock = Clock.fixed(Instant.parse("2026-11-15T00:00:00Z"), ZoneOffset.UTC);
    private final PlantingClimateService service = new PlantingClimateService(nasa, summaries, clock);

    private void givenPeriod(LocalDate start, LocalDate end) {
        var days = start.datesUntil(end.plusDays(1))
                .map(date -> new ClimateResponse.Day(date, 10.0, 1.0, 40.0, 12.0)).toList();
        when(nasa.fetch(31, 74, start, end)).thenReturn(new ClimateResponse(31, 74,
                new ClimateResponse.Period(start, end), "UTC", "NASA POWER", "https://power.larc.nasa.gov",
                "COMPLETE", false, Map.of("temperature", "C", "precipitation", "mm/day",
                "relativeHumidity", "%", "solarRadiation", "MJ/m^2/day"), days));
    }

    @ParameterizedTest
    @CsvSource({"2025-01-01,2025-01-02", "2024-02-29,2024-02-29", "2024-12-15,2025-01-15",
            "1981-01-01,1981-01-01", "2024-01-01,2024-12-31", "2026-11-14,2026-11-14"})
    void historicalDatesUsedDirectly(LocalDate start, LocalDate end) {
        givenPeriod(start, end);
        var result = service.fetch(31, 74, start, end);
        assertEquals("HISTORICAL_DATA", result.dataMode());
        assertEquals(new ClimateResponse.Period(start, end), result.summary().period());
        assertEquals(result.requestedDays(), result.summary().expectedDays());
        assertEquals((double) result.requestedDays(), result.summary().precipitation().totalPrecipitation());
        assertFalse(result.isForecast());
        verify(nasa).fetch(31, 74, start, end);
        verifyNoMoreInteractions(nasa);
    }

    @ParameterizedTest
    @CsvSource({"2026-11-15,2026-11-15,2025-11-15,2025-11-15",
            "2026-11-14,2026-11-15,2025-11-14,2025-11-15",
            "2027-03-01,2027-04-01,2025-03-01,2025-04-01",
            "2027-11-01,2028-02-29,2023-11-01,2024-02-29",
            "2028-02-29,2028-02-29,2024-02-29,2024-02-29",
            "2028-02-28,2028-03-01,2024-02-28,2024-03-01",
            "2027-02-28,2027-03-01,2025-02-28,2025-03-01",
            "2027-12-01,2028-01-31,2024-12-01,2025-01-31",
            "2100-02-28,2100-03-01,2025-02-28,2025-03-01"})
    void estimatesPreserveCalendarDatesAndDayCount(LocalDate start, LocalDate end,
            LocalDate actualStart, LocalDate actualEnd) {
        givenPeriod(actualStart, actualEnd);
        var result = service.fetch(31, 74, start, end);
        assertEquals("HISTORICAL_ESTIMATE", result.dataMode());
        assertEquals(new ClimateResponse.Period(start, end), result.requestedPeriod());
        assertEquals(new ClimateResponse.Period(actualStart, actualEnd), result.summary().period());
        assertEquals(ChronoUnit.DAYS.between(start, end) + 1, result.requestedDays());
        assertEquals(result.requestedDays(), result.summary().expectedDays());
        assertFalse(result.isForecast());
        assertTrue(actualEnd.isBefore(LocalDate.of(2026, 1, 1)));
        verify(nasa).fetch(31, 74, actualStart, actualEnd);
        verifyNoMoreInteractions(nasa);
    }

    @ParameterizedTest
    @CsvSource({"2025-02-02,2025-02-01", "2024-01-01,2025-01-01", "1980-12-31,1981-01-01"})
    void invalidPeriodsNeverCallNasa(LocalDate start, LocalDate end) {
        var ex = assertThrows(ResponseStatusException.class, () -> service.fetch(31, 74, start, end));
        assertEquals(400, ex.getStatusCode().value());
        verifyNoInteractions(nasa);
    }

    @Test
    void sharedLoadRetainsDailyAndSummaryFromOneNasaCall() {
        var start = LocalDate.of(2025, 1, 1);
        var end = start.plusDays(1);
        givenPeriod(start, end);
        var result = service.load(31, 74, start, end);
        assertEquals(2, result.daily().daily().size());
        assertEquals(result.daily().period(), result.response().summary().period());
        assertEquals(10.0, result.response().summary().temperature().average());
        verify(nasa).fetch(31, 74, start, end);
        verifyNoMoreInteractions(nasa);
    }

    @Test
    void noComparableLeapPeriodReturns422() {
        var earlyClock = Clock.fixed(Instant.parse("1983-01-01T00:00:00Z"), ZoneOffset.UTC);
        var early = new PlantingClimateService(nasa, summaries, earlyClock);
        var ex = assertThrows(ResponseStatusException.class, () -> early.fetch(31, 74,
                LocalDate.of(1984, 2, 29), LocalDate.of(1984, 2, 29)));
        assertEquals(422, ex.getStatusCode().value());
        verifyNoInteractions(nasa);
    }

    @Test
    void missingRainRemainsNullAndPartial() {
        var date = LocalDate.of(2025, 1, 1);
        when(nasa.fetch(31, 74, date, date)).thenReturn(new ClimateResponse(31, 74,
                new ClimateResponse.Period(date, date), "UTC", "NASA POWER", "url", "PARTIAL", true,
                Map.of("temperature", "C", "precipitation", "mm/day", "relativeHumidity", "%", "solarRadiation", "MJ/m^2/day"),
                List.of(new ClimateResponse.Day(date, 10.0, null, 40.0, 12.0))));
        var result = service.fetch(31, 74, date, date);
        assertEquals("PARTIAL", result.summary().dataStatus());
        assertNull(result.summary().precipitation().totalPrecipitation());
        assertFalse(result.summary().precipitation().completePeriod());
        assertEquals(0, result.summary().precipitation().validDays());
    }
}
