package com.callmeagro.backend.service;

import com.callmeagro.backend.exception.SatelliteException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.ObjectMapper;
import org.locationtech.jts.geom.Envelope;
import java.io.IOException;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.time.*;
import java.util.*;

@Service
public class NasaHlsService {
    public record Granule(String id, String collection, String observedAt, Double cloudCover,
            String indicatorUrl, String qualityUrl) {}
    private record Cached(long expires, List<Granule> granules) {}
    private final Map<String, Cached> cache = new LinkedHashMap<>();
    private final String catalogUrl;
    private final String token;
    private final int connectTimeout;
    private final int readTimeout;
    private final ObjectMapper mapper = new ObjectMapper();

    public NasaHlsService(@Value("${satellite.catalog-url:https://cmr.earthdata.nasa.gov/stac/LPCLOUD}") String catalogUrl,
            @Value("${satellite.earthdata-token:}") String token,
            @Value("${satellite.connect-timeout:5s}") Duration connectTimeout,
            @Value("${satellite.read-timeout:30s}") Duration readTimeout) {
        this.catalogUrl = catalogUrl.replaceAll("/$", "");
        this.token = token;
        this.connectTimeout = Math.toIntExact(connectTimeout.toMillis());
        this.readTimeout = Math.toIntExact(readTimeout.toMillis());
    }

    public List<Granule> search(Envelope box, LocalDate start, LocalDate end, String indicator) {
        String bbox = box.getMinX() + "," + box.getMinY() + "," + box.getMaxX() + "," + box.getMaxY();
        String key = bbox + start + end + indicator;
        synchronized (cache) {
            var cached = cache.get(key);
            if (cached != null && cached.expires > System.currentTimeMillis()) return cached.granules;
        }
        var result = new LinkedHashMap<String, Granule>();
        for (String collection : List.of("HLSL30_VI_2.0", "HLSS30_VI_2.0")) {
            String url = catalogUrl + "/search?collections=" + collection + "&bbox=" + encode(bbox)
                    + "&datetime=" + encode(start + "T00:00:00Z/" + end + "T23:59:59.999999999Z") + "&limit=200";
            var visited = new HashSet<String>();
            while (url != null) {
                if (!visited.add(url) || visited.size() > 5) throw limit();
                JsonNode root;
                try { root = mapper.readTree(fetch(url, false, 8_000_000)); }
                catch (RuntimeException ex) {
                    if (ex instanceof SatelliteException satellite) throw satellite;
                    throw provider();
                }
                if (root == null || !root.path("features").isArray()) throw provider();
                for (var feature : root.path("features")) {
                    String id = string(feature, "id");
                    String observedAt = string(feature.path("properties"), "datetime");
                    try {
                        var day = Instant.parse(observedAt).atOffset(ZoneOffset.UTC).toLocalDate();
                        if (day.isBefore(start) || day.isAfter(end)) throw provider();
                    } catch (DateTimeException ex) { throw provider(); }
                    String vi = string(feature.path("assets").path(indicator), "href");
                    String qa = string(feature.path("assets").path("Fmask"), "href");
                    validateAsset(vi);
                    validateAsset(qa);
                    var cloud = feature.path("properties").path("eo:cloud_cover");
                    Double cover = cloud.isNumber() ? cloud.asDouble() : null;
                    if (cover != null && (!Double.isFinite(cover) || cover < 0 || cover > 100)) throw provider();
                    result.put(collection + "/" + id, new Granule(id, collection, observedAt, cover, vi, qa));
                    if (result.size() > 200) throw limit();
                }
                url = null;
                if (!root.path("links").isArray()) throw provider();
                for (var link : root.path("links")) {
                    if ("next".equals(link.path("rel").asString())) {
                        String next = string(link, "href");
                        if (!next.startsWith(catalogUrl + "/search?")) throw provider();
                        url = next;
                    }
                }
            }
        }
        var sorted = result.values().stream().sorted(Comparator.comparing(Granule::observedAt).thenComparing(Granule::id)).toList();
        synchronized (cache) {
            cache.entrySet().removeIf(e -> e.getValue().expires < System.currentTimeMillis());
            if (cache.size() >= 64) cache.remove(cache.keySet().iterator().next());
            cache.put(key, new Cached(System.currentTimeMillis() + 300_000, sorted));
        }
        return sorted;
    }

    public byte[] download(String url) {
        if (token.isBlank()) throw new SatelliteException(HttpStatus.SERVICE_UNAVAILABLE, "EARTHDATA_NOT_CONFIGURED",
                "Configure a server-side Earthdata bearer token to read protected HLS assets.");
        validateAsset(url);
        return fetch(url, true, 100_000_000);
    }

    private byte[] fetch(String url, boolean authenticated, int maximum) {
        HttpURLConnection connection = null;
        try {
            connection = openConnection(URI.create(url));
            connection.setInstanceFollowRedirects(false);
            connection.setConnectTimeout(connectTimeout);
            connection.setReadTimeout(readTimeout);
            connection.setRequestProperty("Accept", authenticated ? "image/tiff" : "application/geo+json");
            if (authenticated) connection.setRequestProperty("Authorization", "Bearer " + token);
            int status = connection.getResponseCode();
            if (authenticated && status == 303) {
                URI redirect = URI.create(connection.getHeaderField("Location"));
                if (!"https".equals(redirect.getScheme())
                        || !"d1nklfio7vscoe.cloudfront.net".equals(redirect.getHost())
                        || redirect.getUserInfo() != null || redirect.getPort() != -1) throw provider();
                connection.disconnect();
                connection = openConnection(redirect);
                connection.setInstanceFollowRedirects(false);
                connection.setConnectTimeout(connectTimeout);
                connection.setReadTimeout(readTimeout);
                connection.setRequestProperty("Accept", "image/tiff");
                status = connection.getResponseCode();
            }
            if (authenticated && (status == 401 || status == 403 || status / 100 == 3)) {
                throw new SatelliteException(HttpStatus.BAD_GATEWAY, "EARTHDATA_AUTHENTICATION_FAILED",
                        "Earthdata rejected access. Check token expiry and LP DAAC application authorization.");
            }
            if (status == 429) throw new SatelliteException(HttpStatus.SERVICE_UNAVAILABLE, "PROVIDER_RATE_LIMITED", "NASA rate limit reached. Retry later.");
            if (status != 200 || connection.getContentLengthLong() > maximum) throw provider();
            long deadline = System.nanoTime() + Duration.ofMillis(readTimeout).toNanos();
            try (var stream = connection.getInputStream(); var out = new java.io.ByteArrayOutputStream()) {
                byte[] buffer = new byte[16384];
                int count;
                while ((count = stream.read(buffer)) != -1) {
                    if (System.nanoTime() > deadline) throw new SocketTimeoutException();
                    if (out.size() + count > maximum) throw provider();
                    out.write(buffer, 0, count);
                }
                return out.toByteArray();
            }
        } catch (SocketTimeoutException ex) {
            throw new SatelliteException(HttpStatus.GATEWAY_TIMEOUT, "PROVIDER_TIMEOUT", "NASA request timed out.");
        } catch (IOException | IllegalArgumentException ex) { throw provider(); }
        finally { if (connection != null) connection.disconnect(); }
    }

    protected HttpURLConnection openConnection(URI uri) throws IOException {
        return (HttpURLConnection) uri.toURL().openConnection();
    }

    private void validateAsset(String url) {
        URI uri;
        try { uri = URI.create(url); } catch (RuntimeException ex) { throw provider(); }
        if (!"https".equals(uri.getScheme()) || !"data.lpdaac.earthdatacloud.nasa.gov".equals(uri.getHost())
                || uri.getPort() != -1 || uri.getUserInfo() != null || uri.getQuery() != null
                || !uri.getPath().startsWith("/lp-prod-protected/HLS") || !uri.getPath().endsWith(".tif")) throw provider();
    }

    private static String string(JsonNode node, String field) {
        var value = node.path(field);
        if (!value.isString() || value.asString().isBlank()) throw provider();
        return value.asString();
    }
    private static String encode(String value) { return URLEncoder.encode(value, StandardCharsets.UTF_8); }
    private static SatelliteException limit() {
        return new SatelliteException(HttpStatus.UNPROCESSABLE_CONTENT, "TOO_MANY_OBSERVATIONS", "Narrow the date range; maximum 200 catalog granules.");
    }
    public static SatelliteException provider() {
        return new SatelliteException(HttpStatus.BAD_GATEWAY, "PROVIDER_ERROR", "NASA HLS is unavailable or returned unsupported or invalid data.");
    }
}
