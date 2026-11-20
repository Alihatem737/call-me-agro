package com.callmeagro.backend.service;

import com.callmeagro.backend.exception.SatelliteException;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.locationtech.jts.geom.Polygon;
import javax.imageio.ImageIO;
import javax.imageio.ImageTypeSpecifier;
import javax.imageio.plugins.tiff.*;
import javax.imageio.stream.MemoryCacheImageOutputStream;
import java.awt.image.BufferedImage;
import java.io.ByteArrayOutputStream;
import static org.junit.jupiter.api.Assertions.*;

class HlsRasterServiceTests {
    static byte[] tiff(int value, int epsg, boolean quality) throws Exception {
        var image = new BufferedImage(10,10,BufferedImage.TYPE_BYTE_GRAY);
        if (!quality) {
            var model = new java.awt.image.ComponentSampleModel(java.awt.image.DataBuffer.TYPE_SHORT,10,10,1,10,new int[]{0});
            var raster = java.awt.image.Raster.createWritableRaster(model,new java.awt.image.DataBufferShort(100),null);
            var colors = new java.awt.image.ComponentColorModel(java.awt.color.ColorSpace.getInstance(java.awt.color.ColorSpace.CS_GRAY),
                    false,false,java.awt.Transparency.OPAQUE,java.awt.image.DataBuffer.TYPE_SHORT);
            image = new BufferedImage(colors,raster,false,null);
        }
        for(int y=0;y<10;y++) for(int x=0;x<10;x++) image.getRaster().setSample(x,y,0,value);
        var writer = ImageIO.getImageWritersByFormatName("TIFF").next();
        var directory = TIFFDirectory.createFromMetadata(writer.getDefaultImageMetadata(new ImageTypeSpecifier(image),writer.getDefaultWriteParam()));
        var tags = GeoTIFFTagSet.getInstance();
        directory.addTagSet(tags);
        directory.addTIFFField(new TIFFField(tags.getTag(33550),TIFFTag.TIFF_DOUBLE,3,new double[]{30,30,0}));
        directory.addTIFFField(new TIFFField(tags.getTag(33922),TIFFTag.TIFF_DOUBLE,6,new double[]{0,0,0,500000,3500000,0}));
        directory.addTIFFField(new TIFFField(tags.getTag(34735),TIFFTag.TIFF_SHORT,12,
                new char[]{1,1,0,2,1025,0,1,1,3072,0,1,(char)epsg}));
        var output = new ByteArrayOutputStream();
        try(var stream = new MemoryCacheImageOutputStream(output)) {
            writer.setOutput(stream);
            var param = writer.getDefaultWriteParam();
            param.setCompressionMode(javax.imageio.ImageWriteParam.MODE_EXPLICIT);
            param.setCompressionType("Deflate");
            writer.write(null,new javax.imageio.IIOImage(image,null,directory.getAsMetadata()),param);
        } finally { writer.dispose(); }
        return output.toByteArray();
    }
    static Polygon field() {
        var factory = new org.locationtech.jts.geom.GeometryFactory();
        var rectangle = factory.toGeometry(new org.locationtech.jts.geom.Envelope(499990,500310,3499690,3500010));
        return (Polygon) SatelliteGeometry.project(rectangle,32643,true);
    }
    static NasaHlsService.Granule granule() { return new NasaHlsService.Granule("test-only", "HLSL30_VI_2.0", "2025-01-01T00:00:00Z",100.0,"vi","qa"); }
    @Test
    void readsGeoreferencedTiffScalesStatisticsAndReturnsLeafletCells() throws Exception {
        var result = new HlsRasterService().analyze(granule(),tiff(5000,32643,false),tiff(0,32643,true),field(),true);
        assertEquals("COMPLETE",result.status());
        assertEquals(100,result.validPixels());
        assertEquals(0.5,result.statistics().mean(),0.000001);
        assertEquals(0.5,result.statistics().median(),0.000001);
        assertEquals(100,result.layer().features().size());
        assertEquals("Polygon",result.layer().features().get(0).geometry().type());
        assertEquals(75,result.layer().features().get(0).geometry().coordinates().get(0).get(0).get(0),0.001);
    }
    @Test
    void cloudyAndInvalidPixelsNeverCreateStatisticsOrVisibleCells() throws Exception {
        var service = new HlsRasterService();
        var cloud = service.analyze(granule(),tiff(5000,32643,false),tiff(2,32643,true),field(),true);
        assertEquals("CLOUD_OBSCURED",cloud.status());
        assertEquals(100,cloud.cloudPixels());
        assertNull(cloud.statistics());
        assertTrue(cloud.layer().features().isEmpty());
        var invalid = service.analyze(granule(),tiff(30000,32643,false),tiff(0,32643,true),field(),false);
        assertEquals("NO_VALID_DATA",invalid.status());
        assertNull(invalid.statistics());
        assertNull(invalid.layer());
    }
    @Test
    void rejectsMisalignedOrMalformedRaster() throws Exception {
        var service = new HlsRasterService();
        assertThrows(SatelliteException.class,()->service.analyze(granule(),tiff(5000,32643,false),tiff(0,32642,true),field(),true));
        assertThrows(SatelliteException.class,()->service.read(new byte[]{1,2,3},field()));
    }
    @ParameterizedTest
    @ValueSource(ints={1,2,4,8,16,32,192,255})
    void rejectsUnsuitableQualityBits(int value) { assertFalse(HlsRasterService.validQuality(value)); }
    @ParameterizedTest
    @ValueSource(ints={0,64,128})
    void acceptsClearLandWithoutHighAerosol(int value) { assertTrue(HlsRasterService.validQuality(value)); }
    @Test
    void excludesFillAndOutOfRangeBeforeScaling() {
        for(double raw : new double[]{-9999,-19999,-10001,10001,Double.NaN}) assertFalse(HlsRasterService.validValue(raw,null));
        assertFalse(HlsRasterService.validValue(2000,2000.0));
        assertTrue(HlsRasterService.validValue(-10000,null));
        assertTrue(HlsRasterService.validValue(10000,null));
    }
    @Test
    void signedNegativeValuesAndBothDocumentedFillValuesAreHandled() throws Exception {
        var service = new HlsRasterService();
        var negative = service.analyze(granule(),tiff(-5000,32643,false),tiff(0,32643,true),field(),false);
        assertEquals(-0.5,negative.statistics().mean(),0.000001);
        for(int fill : new int[]{-9999,-19999}) {
            var result = service.analyze(granule(),tiff(fill,32643,false),tiff(0,32643,true),field(),false);
            assertEquals(0,result.validPixels());
            assertNull(result.statistics());
        }
    }
    @Test
    void holesAndBoundaryMixedCellsAreExcludedAndNarrowFieldsAreRejected() throws Exception {
        var service = new HlsRasterService();
        var factory = new org.locationtech.jts.geom.GeometryFactory();
        var outer = (Polygon) SatelliteGeometry.project(field(),32643,false);
        var hole = (Polygon)factory.toGeometry(new org.locationtech.jts.geom.Envelope(500110,500190,3499810,3499890));
        var withHole = factory.createPolygon(outer.getExteriorRing(),new org.locationtech.jts.geom.LinearRing[]{hole.getExteriorRing()});
        var geographic = (Polygon)SatelliteGeometry.project(withHole,32643,true);
        var result = service.analyze(granule(),tiff(5000,32643,false),tiff(0,32643,true),geographic,true);
        assertTrue(result.validPixels() < 100);
        assertEquals(result.validPixels(),result.layer().features().size());
        var thin = (Polygon) SatelliteGeometry.project(factory.toGeometry(new org.locationtech.jts.geom.Envelope(500001,500020,3499701,3499999)),32643,true);
        var insufficient = service.analyze(granule(),tiff(5000,32643,false),tiff(0,32643,true),thin,true);
        assertEquals("INSUFFICIENT_PIXELS",insufficient.status());
        assertNull(insufficient.statistics());
    }
}
