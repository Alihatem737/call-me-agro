package com.callmeagro.backend.service;

import com.callmeagro.backend.dto.ClimateResponse;
import com.callmeagro.backend.dto.ClimateSummaryResponse;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import java.time.temporal.ChronoUnit;
import java.util.DoubleSummaryStatistics;
import java.util.function.Function;

@Service
public class ClimateSummaryService {
    private final NasaPowerService nasa;

    public ClimateSummaryService(NasaPowerService nasa) {
        this.nasa = nasa;
    }

    public ClimateSummaryResponse fetch(double latitude, double longitude) {
        return summarize(nasa.fetch(latitude, longitude));
    }

    public ClimateSummaryResponse summarize(ClimateResponse climate) {
        if (!"mm/day".equals(climate.units().get("precipitation"))) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY,
                    "NASA POWER returned an unsupported precipitation unit.");
        }
        long expectedDays = ChronoUnit.DAYS.between(climate.period().start(), climate.period().end()) + 1;
        var temperature = statistics(climate, ClimateResponse.Day::temperature);
        var precipitation = statistics(climate, ClimateResponse.Day::precipitation);
        var humidity = statistics(climate, ClimateResponse.Day::relativeHumidity);
        var solar = statistics(climate, ClimateResponse.Day::solarRadiation);
        return new ClimateSummaryResponse(climate.latitude(), climate.longitude(), climate.period(),
                climate.timeStandard(), climate.source(), climate.sourceUrl(), climate.dataStatus(),
                climate.hasMissingData(), expectedDays,
                new ClimateSummaryResponse.Temperature(average(temperature),
                        temperature.getCount() == 0 ? null : temperature.getMin(),
                        temperature.getCount() == 0 ? null : temperature.getMax(),
                        "Statistics of daily mean temperature (NASA T2M), not actual temperature extremes.",
                        climate.units().get("temperature"), temperature.getCount()),
                new ClimateSummaryResponse.Precipitation(
                        precipitation.getCount() == 0 ? null : precipitation.getSum(),
                        "Sum of available daily precipitation only; missing days are not estimated.",
                        precipitation.getCount() == expectedDays, "mm", precipitation.getCount()),
                new ClimateSummaryResponse.Average(average(humidity),
                        climate.units().get("relativeHumidity"), humidity.getCount()),
                new ClimateSummaryResponse.Average(average(solar),
                        climate.units().get("solarRadiation"), solar.getCount()));
    }

    private DoubleSummaryStatistics statistics(ClimateResponse climate,
            Function<ClimateResponse.Day, Double> value) {
        return climate.daily().stream().map(value).filter(number -> number != null)
                .mapToDouble(Double::doubleValue).summaryStatistics();
    }

    private Double average(DoubleSummaryStatistics statistics) {
        return statistics.getCount() == 0 ? null : statistics.getAverage();
    }
}
