package com.callmeagro.backend.service;

import com.callmeagro.backend.dto.*;
import com.callmeagro.backend.exception.SatelliteException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import java.time.LocalDate;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class SatelliteMonitoringServiceTests {
    static SatelliteRequest.Boundary boundary() {
        return new SatelliteRequest.Boundary("Polygon", List.of(List.of(List.of(74.35,31.51),
                List.of(74.354,31.51),List.of(74.354,31.514),List.of(74.35,31.514),List.of(74.35,31.51))));
    }
    static SatelliteRequest request() {
        return new SatelliteRequest(boundary(), "NDVI", null, LocalDate.of(2025,1,1), LocalDate.of(2025,1,5));
    }
    @Test
    void datesDoNotDownloadProtectedDataAndSuccessfulSearchIsCached() {
        var nasa = mock(NasaHlsService.class);
        var raster = mock(HlsRasterService.class);
        var granule = new NasaHlsService.Granule("id", "HLSS30_VI_2.0", "2025-01-03T00:00:00Z", 90.0, "vi", "qa");
        when(nasa.search(any(),any(),any(),any())).thenReturn(List.of(granule));
        var service = new SatelliteMonitoringService(nasa,raster);
        var result = service.process(request(),"dates");
        assertEquals("AVAILABLE",result.status());
        assertEquals("QUALITY_NOT_EVALUATED",result.observations().get(0).status());
        assertNull(result.observations().get(0).statistics());
        assertSame(result,service.process(request(),"dates"));
        verify(nasa,times(1)).search(any(),any(),any(),any());
        verifyNoInteractions(raster);
        verify(nasa,never()).download(any());
    }
    @Test
    void missingCatalogDataDoesNotBecomeFakeStatistics() {
        var nasa = mock(NasaHlsService.class);
        when(nasa.search(any(),any(),any(),any())).thenReturn(List.of());
        var result = new SatelliteMonitoringService(nasa,mock(HlsRasterService.class)).process(request(),"history");
        assertEquals("NO_OBSERVATIONS",result.status());
        assertTrue(result.observations().isEmpty());
    }
    @Test
    void authenticatesAndProcessesExactDateWithoutChangingIt() {
        var nasa = mock(NasaHlsService.class);
        var raster = mock(HlsRasterService.class);
        var granule = new NasaHlsService.Granule("id","HLSL30_VI_2.0","2025-01-03T00:00:00Z",0.0,"vi","qa");
        when(nasa.search(any(),any(),any(),eq("NDMI"))).thenReturn(List.of(granule));
        when(nasa.download("vi")).thenReturn(new byte[]{1});
        when(nasa.download("qa")).thenThrow(new SatelliteException(org.springframework.http.HttpStatus.BAD_GATEWAY,"EARTHDATA_AUTHENTICATION_FAILED","Denied"));
        var service = new SatelliteMonitoringService(nasa,raster);
        var request = new SatelliteRequest(boundary(),"NDMI",LocalDate.of(2025,1,3),null,null);
        assertEquals("EARTHDATA_AUTHENTICATION_FAILED",assertThrows(SatelliteException.class,()-> service.process(request,"analysis")).code());
        verify(nasa).search(any(),eq(request.date()),eq(request.date()),eq("NDMI"));
        verifyNoInteractions(raster);
    }
    @ParameterizedTest
    @ValueSource(strings={"", "ndvi", "EVI"})
    void rejectsUnsupportedIndicators(String indicator) {
        var nasa = mock(NasaHlsService.class);
        var request = new SatelliteRequest(boundary(),indicator,null,LocalDate.of(2025,1,1),LocalDate.of(2025,1,2));
        assertThrows(SatelliteException.class,()->new SatelliteMonitoringService(nasa,mock(HlsRasterService.class)).process(request,"history"));
        verifyNoInteractions(nasa);
    }
    @Test
    void validatesDatesAndBoundaryBeforeProviderCall() {
        var nasa = mock(NasaHlsService.class);
        var service = new SatelliteMonitoringService(nasa,mock(HlsRasterService.class));
        for (var request : List.of(new SatelliteRequest(boundary(),"NDVI",null,null,null),
                new SatelliteRequest(boundary(),"NDVI",null,LocalDate.of(2025,1,2),LocalDate.of(2025,1,1)),
                new SatelliteRequest(boundary(),"NDVI",null,LocalDate.of(2024,1,1),LocalDate.of(2025,1,1)),
                new SatelliteRequest(boundary(),"NDVI",null,LocalDate.now().plusDays(1),LocalDate.now().plusDays(1)),
                new SatelliteRequest(null,"NDVI",null,LocalDate.of(2025,1,1),LocalDate.of(2025,1,2)))) {
            assertThrows(SatelliteException.class,()->service.process(request,"history"));
        }
        verifyNoInteractions(nasa);
    }
    @Test
    void rejectsTinySelfIntersectingUnclosedAndOversizedPolygons() {
        for (var boundary : List.of(
                new SatelliteRequest.Boundary("Point", List.of()),
                new SatelliteRequest.Boundary("Polygon",List.of(List.of(List.of(0.0,0.0),List.of(0.0001,0.0),List.of(0.0001,0.0001),List.of(0.0,0.0)))),
                new SatelliteRequest.Boundary("Polygon",List.of(List.of(List.of(0.0,0.0),List.of(0.01,0.01),List.of(0.0,0.01),List.of(0.01,0.0),List.of(0.0,0.0)))),
                new SatelliteRequest.Boundary("Polygon",List.of(List.of(List.of(0.0,0.0),List.of(0.01,0.0),List.of(0.01,0.01),List.of(0.0,0.01)))),
                new SatelliteRequest.Boundary("Polygon",List.of(List.of(List.of(0.0,0.0),List.of(1.0,0.0),List.of(1.0,1.0),List.of(0.0,0.0)))))) {
            assertThrows(SatelliteException.class,()->SatelliteGeometry.validate(boundary));
        }
        assertTrue(SatelliteGeometry.validate(boundary()).isValid());
    }
    @Test
    void projectionRoundTripsSouthernHemisphereAndKnownCentralMeridian() {
        var factory = new org.locationtech.jts.geom.GeometryFactory();
        var point = factory.createPoint(new org.locationtech.jts.geom.Coordinate(75, -30));
        var projected = SatelliteGeometry.project(point,32743,false);
        assertEquals(500000,projected.getCoordinate().x,0.001);
        var back = SatelliteGeometry.project(projected,32743,true);
        assertEquals(75,back.getCoordinate().x,0.000001);
        assertEquals(-30,back.getCoordinate().y,0.000001);
    }
}
