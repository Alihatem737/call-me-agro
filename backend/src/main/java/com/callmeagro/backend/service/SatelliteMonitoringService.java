package com.callmeagro.backend.service;

import com.callmeagro.backend.dto.SatelliteRequest;
import com.callmeagro.backend.dto.SatelliteResponse;
import com.callmeagro.backend.exception.SatelliteException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import java.time.*;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.concurrent.Semaphore;

@Service
public class SatelliteMonitoringService {
    private final NasaHlsService nasa;
    private final HlsRasterService raster;
    private final Semaphore capacity = new Semaphore(1);
    private final Map<String, Cached> cache = new LinkedHashMap<>();
    private record Cached(long expires, SatelliteResponse response) {}
    public SatelliteMonitoringService(NasaHlsService nasa, HlsRasterService raster) {
        this.nasa = nasa;
        this.raster = raster;
    }

    public SatelliteResponse process(SatelliteRequest request, String operation) {
        if (request == null || !Set.of("NDVI", "NDMI").contains(Objects.toString(request.indicator(), ""))) throw invalid();
        boolean analysis = "analysis".equals(operation);
        boolean dates = "dates".equals(operation);
        LocalDate start = analysis ? request.date() : request.startDate();
        LocalDate end = analysis ? request.date() : request.endDate();
        if (start == null || end == null || end.isBefore(start) || start.isBefore(LocalDate.of(2013, 1, 1))
                || end.isAfter(LocalDate.now(ZoneOffset.UTC)) || ChronoUnit.DAYS.between(start,end) >= 366
                || (analysis && (request.startDate() != null || request.endDate() != null))
                || (!analysis && request.date() != null)) throw invalid();
        var field = SatelliteGeometry.validate(request.boundary());
        double area = SatelliteGeometry.project(field, SatelliteGeometry.utmEpsg(field), false).getArea();
        String key = operation + request.toString();
        synchronized (cache) {
            var cached = cache.get(key);
            if (cached != null && cached.expires > System.currentTimeMillis()) return cached.response;
        }
        if (!capacity.tryAcquire()) throw new SatelliteException(HttpStatus.SERVICE_UNAVAILABLE, "SATELLITE_BUSY", "Satellite processor is busy. Retry later.");
        try {
            var granules = nasa.search(field.getEnvelopeInternal(), start, end, request.indicator());
            if (!dates && granules.size() > 32) throw new SatelliteException(HttpStatus.UNPROCESSABLE_CONTENT,
                    "TOO_MANY_OBSERVATIONS", "At most 32 granules can be processed synchronously. Split the date range.");
            var observations = new ArrayList<SatelliteResponse.Observation>();
            long deadline = System.nanoTime() + Duration.ofSeconds(120).toNanos();
            for (var granule : granules) {
                if (System.nanoTime() > deadline) throw new SatelliteException(HttpStatus.GATEWAY_TIMEOUT, "PROCESSING_TIMEOUT", "Split the date range into smaller requests.");
                if (dates) {
                    observations.add(new SatelliteResponse.Observation(granule.id(), granule.collection(), "NASA HLS-VI v2.0",
                            granule.observedAt(), Instant.parse(granule.observedAt()).atOffset(ZoneOffset.UTC).toLocalDate(),
                            "QUALITY_NOT_EVALUATED", granule.cloudCover(), 0, 0, 0, 0, null, null));
                } else {
                    var vi = nasa.download(granule.indicatorUrl());
                    var qa = nasa.download(granule.qualityUrl());
                    observations.add(raster.analyze(granule, vi, qa, field, analysis));
                }
            }
            String status = observations.isEmpty() ? "NO_OBSERVATIONS" : dates ? "AVAILABLE"
                    : observations.stream().allMatch(o -> "COMPLETE".equals(o.status())) ? "COMPLETE"
                    : observations.stream().anyMatch(o -> "COMPLETE".equals(o.status())) ? "PARTIAL" : "NO_SUITABLE_OBSERVATIONS";
            var response = new SatelliteResponse(status, request.indicator(), "dimensionless", 30, area,
                    "Vegetation indicators are not disease diagnoses. Only complete field-contained pixels are used. "
                    + "Minimum nine valid pixels, 50% valid pixels and 50% field-area coverage are engineering thresholds, not a NASA accuracy guarantee. "
                    + "Catalog footprints and cloud percentages are tile-level; available dates do not guarantee usable field pixels. "
                    + "Observations remain separate per granule; no interpolation, nearest-date substitution or daily mosaic. Times identify source granules, not precise field overpass times.",
                    List.copyOf(observations));
            synchronized (cache) {
                cache.entrySet().removeIf(e -> e.getValue().expires < System.currentTimeMillis());
                if (cache.size() >= 16) cache.remove(cache.keySet().iterator().next());
                cache.put(key, new Cached(System.currentTimeMillis()+300_000, response));
            }
            return response;
        } finally { capacity.release(); }
    }

    private SatelliteException invalid() {
        return new SatelliteException(HttpStatus.BAD_REQUEST, "INVALID_REQUEST",
                "Use NDVI or NDMI; analysis requires date only, history/dates require startDate and endDate only. "
                + "Dates must be historical UTC calendar dates from 2013, ordered, maximum 366 inclusive days.");
    }
}
