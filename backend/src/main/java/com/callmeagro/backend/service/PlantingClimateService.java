package com.callmeagro.backend.service;

import com.callmeagro.backend.dto.ClimateResponse;
import com.callmeagro.backend.dto.PlantingClimateResponse;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.time.Clock;
import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;

@Service
public class PlantingClimateService {
    private static final LocalDate FIRST_DATE = LocalDate.of(1981, 1, 1);
    private final NasaPowerService nasa;
    private final ClimateSummaryService summaries;
    private final Clock clock;

    @Autowired
    public PlantingClimateService(NasaPowerService nasa, ClimateSummaryService summaries) {
        this(nasa, summaries, Clock.systemUTC());
    }

    PlantingClimateService(NasaPowerService nasa, ClimateSummaryService summaries, Clock clock) {
        this.nasa = nasa;
        this.summaries = summaries;
        this.clock = clock.withZone(java.time.ZoneOffset.UTC);
    }

    public PlantingClimateResponse fetch(double latitude, double longitude, LocalDate start, LocalDate end) {
        return load(latitude, longitude, start, end).response();
    }

    LoadedClimate load(double latitude, double longitude, LocalDate start, LocalDate end) {
        if (start == null || end == null || end.isBefore(start)) {
            throw invalid("Provide a valid planting startDate and endDate in chronological order.");
        }
        long days = ChronoUnit.DAYS.between(start, end) + 1;
        if (days > 366 || start.isBefore(FIRST_DATE)) {
            throw invalid("Planting periods must contain 1 to 366 days and start on or after 1981-01-01.");
        }
        LocalDate today = LocalDate.now(clock);
        boolean estimate = !end.isBefore(today);
        var period = estimate ? historicalPeriod(start, end, days, today)
                : new ClimateResponse.Period(start, end);
        var daily = nasa.fetch(latitude, longitude, period.start(), period.end());
        var summary = summaries.summarize(daily);
        var response = new PlantingClimateResponse(new ClimateResponse.Period(start, end), days,
                estimate ? "HISTORICAL_ESTIMATE" : "HISTORICAL_DATA", false,
                estimate ? "Single comparable historical period; same calendar dates and day count; not a forecast."
                        : "Historical NASA data for the requested period; not a forecast.", summary);
        return new LoadedClimate(daily, response);
    }

    record LoadedClimate(ClimateResponse daily, PlantingClimateResponse response) {}

    private ClimateResponse.Period historicalPeriod(LocalDate start, LocalDate end, long days, LocalDate today) {
        LocalDate cutoff = LocalDate.of(today.getYear() - 1, 12, 31);
        int firstShift = Math.max(1, end.getYear() - cutoff.getYear());
        for (int shift = firstShift; start.getYear() - shift >= FIRST_DATE.getYear(); shift++) {
            try {
                LocalDate candidateStart = LocalDate.of(start.getYear() - shift, start.getMonthValue(), start.getDayOfMonth());
                LocalDate candidateEnd = LocalDate.of(end.getYear() - shift, end.getMonthValue(), end.getDayOfMonth());
                if (!candidateStart.isBefore(FIRST_DATE) && !candidateEnd.isAfter(cutoff)
                        && ChronoUnit.DAYS.between(candidateStart, candidateEnd) + 1 == days) {
                    return new ClimateResponse.Period(candidateStart, candidateEnd);
                }
            } catch (DateTimeException ex) {
                continue;
            }
        }
        throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_CONTENT,
                "No comparable historical period with the same calendar dates and day count is available since 1981.");
    }

    private ResponseStatusException invalid(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
