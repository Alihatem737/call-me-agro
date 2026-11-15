package com.callmeagro.backend.service;

import com.callmeagro.backend.dto.ClimateResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import java.net.SocketTimeoutException;
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class NasaPowerService {
    private static final String PATH = "/api/temporal/daily/point";
    private static final Map<String, String> PARAMETERS = new LinkedHashMap<>();
    static {
        PARAMETERS.put("temperature", "T2M");
        PARAMETERS.put("precipitation", "PRECTOTCORR");
        PARAMETERS.put("relativeHumidity", "RH2M");
        PARAMETERS.put("solarRadiation", "ALLSKY_SFC_SW_DWN");
    }
    private final RestClient client;
    private final LocalDate start;
    private final LocalDate end;
    private final String sourceUrl;

    public NasaPowerService(@Value("${nasa.power.base-url}") String baseUrl,
            @Value("${nasa.power.start}") LocalDate start,
            @Value("${nasa.power.end}") LocalDate end,
            @Value("${nasa.power.connect-timeout}") Duration connectTimeout,
            @Value("${nasa.power.read-timeout}") Duration readTimeout) {
        if (end.isBefore(start) || start.isBefore(LocalDate.of(1981, 1, 1))
                || end.isAfter(LocalDate.now()) || start.plusYears(1).isBefore(end)) {
            throw new IllegalArgumentException("Invalid NASA climate period; maximum one year.");
        }
        var factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(connectTimeout);
        factory.setReadTimeout(readTimeout);
        client = RestClient.builder().baseUrl(baseUrl).requestFactory(factory).build();
        this.start = start;
        this.end = end;
        sourceUrl = baseUrl + PATH;
    }

    public ClimateResponse fetch(double latitude, double longitude) {
        return fetch(latitude, longitude, start, end);
    }

    public ClimateResponse fetch(double latitude, double longitude, LocalDate periodStart, LocalDate periodEnd) {
        if (periodStart == null || periodEnd == null || periodEnd.isBefore(periodStart)
                || periodStart.isBefore(LocalDate.of(1981, 1, 1))
                || periodEnd.isAfter(LocalDate.now(java.time.ZoneOffset.UTC))
                || java.time.temporal.ChronoUnit.DAYS.between(periodStart, periodEnd) >= 366) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid NASA period; use 1 to 366 historical days from 1981.");
        }
        try {
            JsonNode root = client.get().uri(builder -> builder.path(PATH)
                    .queryParam("parameters", String.join(",", PARAMETERS.values()))
                    .queryParam("community", "AG").queryParam("latitude", latitude)
                    .queryParam("longitude", longitude)
                    .queryParam("start", periodStart.format(DateTimeFormatter.BASIC_ISO_DATE))
                    .queryParam("end", periodEnd.format(DateTimeFormatter.BASIC_ISO_DATE))
                    .queryParam("format", "JSON").queryParam("time-standard", "UTC")
                    .build()).retrieve().body(JsonNode.class);
            return parse(root, latitude, longitude, periodStart, periodEnd);
        } catch (ResourceAccessException ex) {
            for (Throwable cause = ex; cause != null; cause = cause.getCause()) {
                if (cause instanceof SocketTimeoutException) {
                    throw new ResponseStatusException(HttpStatus.GATEWAY_TIMEOUT, "NASA POWER request timed out.");
                }
            }
            throw failure();
        } catch (RestClientException ex) {
            throw failure();
        }
    }

    private ClimateResponse parse(JsonNode root, double latitude, double longitude, LocalDate periodStart, LocalDate periodEnd) {
        if (root == null || !root.path("properties").path("parameter").isObject()
                || !root.path("parameters").isObject()
                || !root.path("header").path("fill_value").isNumber()) {
            throw failure();
        }
        var data = root.path("properties").path("parameter");
        var units = new LinkedHashMap<String, String>();
        for (var entry : PARAMETERS.entrySet()) {
            var unit = root.path("parameters").path(entry.getValue()).path("units");
            if (!data.path(entry.getValue()).isObject() || !unit.isString() || unit.asString().isBlank()) {
                throw failure();
            }
            units.put(entry.getKey(), unit.asString());
        }
        double fill = root.path("header").path("fill_value").asDouble();
        var days = new ArrayList<ClimateResponse.Day>();
        int valid = 0;
        int total = 0;
        for (LocalDate date = periodStart; !date.isAfter(periodEnd); date = date.plusDays(1)) {
            var values = new ArrayList<Double>();
            for (String parameter : PARAMETERS.values()) {
                var node = data.path(parameter).path(date.format(DateTimeFormatter.BASIC_ISO_DATE));
                if (!node.isMissingNode() && !node.isNull() && !node.isNumber()) {
                    throw failure();
                }
                Double value = node.isNumber() ? node.asDouble() : null;
                if (value != null && (!Double.isFinite(value) || value == fill)) value = null;
                if (value != null) valid++;
                total++;
                values.add(value);
            }
            days.add(new ClimateResponse.Day(date, values.get(0), values.get(1), values.get(2), values.get(3)));
        }
        String status = valid == 0 ? "NO_VALID_DATA" : valid < total ? "PARTIAL" : "COMPLETE";
        return new ClimateResponse(latitude, longitude, new ClimateResponse.Period(periodStart, periodEnd),
                "UTC", "NASA POWER", sourceUrl, status, valid < total, units, days);
    }

    private ResponseStatusException failure() {
        return new ResponseStatusException(HttpStatus.BAD_GATEWAY, "NASA POWER is unavailable or returned an invalid response.");
    }
}
