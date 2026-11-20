package com.callmeagro.backend.service;

import com.callmeagro.backend.exception.SatelliteException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.locationtech.jts.geom.Envelope;
import java.io.*;
import java.net.*;
import java.time.*;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class NasaHlsServiceTests {
    private static final String ASSET = "https://data.lpdaac.earthdatacloud.nasa.gov/lp-prod-protected/HLSL30_VI.020/test/test.NDVI.tif";
    private static final String CATALOG = "https://cmr.earthdata.nasa.gov/stac/LPCLOUD";
    private static HttpURLConnection response(int status, String body) throws Exception {
        var connection = mock(HttpURLConnection.class);
        when(connection.getResponseCode()).thenReturn(status);
        when(connection.getInputStream()).thenReturn(new ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));
        return connection;
    }
    private static NasaHlsService service(String token, HttpURLConnection... connections) {
        var queue = new ArrayDeque<>(java.util.List.of(connections));
        return new NasaHlsService(CATALOG,token,Duration.ofSeconds(1),Duration.ofSeconds(1)) {
            @Override protected HttpURLConnection openConnection(URI uri) { return queue.remove(); }
        };
    }
    private static String page(String links) {
        return """
                {"features":[{"id":"test-only","properties":{"datetime":"2025-01-01T00:00:00Z","eo:cloud_cover":30},
                "assets":{"NDVI":{"href":"%s"},"Fmask":{"href":"%s"}}}],"links":%s}
                """.formatted(ASSET,ASSET.replace("NDVI","Fmask"),links);
    }
    @Test
    void realStacShapeParsesBothCollectionsAndCachesWithoutSendingCredentialsToCatalog() throws Exception {
        var first = response(200,page("[]"));
        var second = response(200,page("[]"));
        var service = service("server-secret-test-only",first,second);
        var box = new Envelope(74.35,74.36,31.51,31.52);
        var date = LocalDate.of(2025,1,1);
        var result = service.search(box,date,date,"NDVI");
        assertEquals(2,result.size());
        assertEquals(ASSET,result.get(0).indicatorUrl());
        assertEquals(30,result.get(0).cloudCover());
        assertSame(result,service.search(box,date,date,"NDVI"));
        verify(first,never()).setRequestProperty(eq("Authorization"),any());
    }
    @Test
    void followsCatalogPaginationWithoutTruncatingHistory() throws Exception {
        String next = "[{\"rel\":\"next\",\"href\":\""+CATALOG+"/search?cursor=next\"}]";
        var service = service("",response(200,page(next)),response(200,"{\"features\":[],\"links\":[]}"),response(200,page("[]")));
        assertEquals(2,service.search(new Envelope(0,1,0,1),LocalDate.of(2025,1,1),LocalDate.of(2025,1,1),"NDVI").size());
    }
    @ParameterizedTest
    @ValueSource(strings={"{}", "not json", "{\"features\":[{}],\"links\":[]}"})
    void rejectsMalformedCatalog(String body) throws Exception {
        var service = service("",response(200,body));
        assertEquals("PROVIDER_ERROR",assertThrows(SatelliteException.class,()->service.search(new Envelope(0,1,0,1),LocalDate.of(2025,1,1),LocalDate.of(2025,1,1),"NDVI")).code());
    }
    @Test
    void refusesUntrustedAssetsAndPagination() throws Exception {
        for(String body : java.util.List.of(page("[]").replace(ASSET,"https://untrusted.example/test.tif"),
                page("[{\"rel\":\"next\",\"href\":\"https://untrusted.example/search\"}]"))) {
            var service = service("",response(200,body));
            assertThrows(SatelliteException.class,()->service.search(new Envelope(0,1,0,1),LocalDate.of(2025,1,1),LocalDate.of(2025,1,1),"NDVI"));
        }
    }
    @ParameterizedTest
    @ValueSource(ints={301,302,401,403})
    void rejectedEarthdataAccessNeverBecomesNoData(int status) throws Exception {
        var connection = response(status,"");
        assertEquals("EARTHDATA_AUTHENTICATION_FAILED",assertThrows(SatelliteException.class,()->service("test-token",connection).download(ASSET)).code());
        verify(connection).setInstanceFollowRedirects(false);
        verify(connection).setRequestProperty("Authorization","Bearer test-token");
    }
    @Test
    void missingTokenAndTimeoutAndProviderFailureHaveDistinctStates() throws Exception {
        assertEquals("EARTHDATA_NOT_CONFIGURED",assertThrows(SatelliteException.class,()->service("").download(ASSET)).code());
        var timeout = mock(HttpURLConnection.class);
        when(timeout.getResponseCode()).thenThrow(new SocketTimeoutException());
        assertEquals("PROVIDER_TIMEOUT",assertThrows(SatelliteException.class,()->service("token",timeout).download(ASSET)).code());
        assertEquals("PROVIDER_ERROR",assertThrows(SatelliteException.class,()->service("token",response(500,"")).download(ASSET)).code());
        assertEquals("PROVIDER_RATE_LIMITED",assertThrows(SatelliteException.class,()->service("token",response(429,"")).download(ASSET)).code());
    }
    @Test
    void followsSignedNasaRedirectWithoutForwardingBearer() throws Exception {
        var redirect = response(303, "");
        when(redirect.getHeaderField("Location")).thenReturn("https://d1nklfio7vscoe.cloudfront.net/file.tif?signature=test");
        var asset = response(200, "raster");
        assertArrayEquals("raster".getBytes(StandardCharsets.UTF_8), service("test-token", redirect, asset).download(ASSET));
        verify(asset, never()).setRequestProperty(eq("Authorization"), any());
    }
    @Test
    void rejectsSignedRedirectToUntrustedHost() throws Exception {
        var redirect = response(303, "");
        when(redirect.getHeaderField("Location")).thenReturn("https://untrusted.example/file.tif");
        assertThrows(SatelliteException.class, () -> service("test-token", redirect).download(ASSET));
    }}
