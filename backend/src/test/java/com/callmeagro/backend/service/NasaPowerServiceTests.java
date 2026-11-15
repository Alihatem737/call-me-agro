package com.callmeagro.backend.service;

import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.server.ResponseStatusException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.jupiter.api.Assertions.*;

class NasaPowerServiceTests {
    private HttpServer server;
    private String body;
    private int status;
    private long delay;
    private final AtomicReference<String> query = new AtomicReference<>();

    @BeforeEach
    void setup() throws Exception {
        body = fixture("12.96");
        status = 200;
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/api/temporal/daily/point", exchange -> {
            query.set(exchange.getRequestURI().getQuery());
            try {
                Thread.sleep(delay);
                byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
                exchange.getResponseHeaders().set("Content-Type", "application/json");
                exchange.sendResponseHeaders(status, bytes.length);
                exchange.getResponseBody().write(bytes);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        });
        server.start();
    }

    @AfterEach
    void stop() {
        server.stop(0);
    }

    private NasaPowerService service(Duration timeout) {
        return new NasaPowerService("http://127.0.0.1:" + server.getAddress().getPort(),
                LocalDate.of(2025, 1, 1), LocalDate.of(2025, 1, 2), Duration.ofSeconds(1), timeout);
    }

    private String fixture(String firstValue) {
        return """
                {"header":{"fill_value":-999},"properties":{"parameter":{
                "T2M":{"20250101":%s,"20250102":15.34},
                "PRECTOTCORR":{"20250101":0,"20250102":0},
                "RH2M":{"20250101":43.79,"20250102":53.34},
                "ALLSKY_SFC_SW_DWN":{"20250101":6.8,"20250102":6.64}}},
                "parameters":{"T2M":{"units":"C"},"PRECTOTCORR":{"units":"mm/day"},
                "RH2M":{"units":"%%"},"ALLSKY_SFC_SW_DWN":{"units":"MJ/m^2/day"}}}
                """.formatted(firstValue);
    }

    @Test
    void mapsDailyValuesUnitsAndRequestPeriod() {
        var result = service(Duration.ofSeconds(2)).fetch(31.5204, 74.3587);
        assertEquals("COMPLETE", result.dataStatus());
        assertFalse(result.hasMissingData());
        assertEquals(12.96, result.daily().get(0).temperature());
        assertEquals(0, result.daily().get(0).precipitation());
        assertEquals("MJ/m^2/day", result.units().get("solarRadiation"));
        assertTrue(query.get().contains("start=20250101"));
        assertTrue(query.get().contains("end=20250102"));
        assertTrue(query.get().contains("time-standard=UTC"));
        assertTrue(query.get().contains("parameters=T2M,PRECTOTCORR,RH2M,ALLSKY_SFC_SW_DWN"));
    }

    @Test
    void explicitPeriodControlsRequestAndResponseWithoutChangingDefault() {
        var client = service(Duration.ofSeconds(2));
        var date = LocalDate.of(2025, 1, 2);
        var result = client.fetch(0, 0, date, date);
        assertEquals(date, result.period().start());
        assertEquals(date, result.period().end());
        assertEquals(1, result.daily().size());
        assertEquals(15.34, result.daily().get(0).temperature());
        assertTrue(query.get().contains("start=20250102"));
        assertTrue(query.get().contains("end=20250102"));
        assertEquals(2, client.fetch(0, 0).daily().size());
    }

    @Test
    void sentinelIsNullAndPartial() {
        body = fixture("-999");
        var result = service(Duration.ofSeconds(2)).fetch(0, 0);
        assertEquals("PARTIAL", result.dataStatus());
        assertNull(result.daily().get(0).temperature());
        assertTrue(result.hasMissingData());
    }

    @Test
    void emptySeriesAreNoValidData() {
        body = fixture("12.96").replaceAll("\\{\\\"20250101\\\":[^}]+}", "{}");
        var result = service(Duration.ofSeconds(2)).fetch(0, 0);
        assertEquals("NO_VALID_DATA", result.dataStatus());
        assertNull(result.daily().get(0).solarRadiation());
    }

    @Test
    void malformedResponseIs502() {
        body = "{}";
        assertFailure(502);
        body = "not json";
        assertFailure(502);
        body = fixture("\"invalid\"");
        assertFailure(502);
    }

    @Test
    void nasaHttpFailureIs502() {
        status = 503;
        assertFailure(502);
    }

    @Test
    void slowNasaIs504() {
        delay = 300;
        var ex = assertThrows(ResponseStatusException.class,
                () -> service(Duration.ofMillis(50)).fetch(0, 0));
        assertEquals(504, ex.getStatusCode().value());
    }

    private void assertFailure(int expectedStatus) {
        var ex = assertThrows(ResponseStatusException.class,
                () -> service(Duration.ofSeconds(2)).fetch(0, 0));
        assertEquals(expectedStatus, ex.getStatusCode().value());
    }
}
