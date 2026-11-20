package com.callmeagro.backend.service;

import com.callmeagro.backend.dto.SatelliteResponse;
import org.locationtech.jts.geom.Polygon;
import org.springframework.stereotype.Service;
import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.plugins.tiff.*;
import javax.imageio.stream.MemoryCacheImageInputStream;
import java.awt.Rectangle;
import java.awt.image.Raster;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.*;

@Service
public class HlsRasterService {
    public record Grid(int width, int height, int epsg, double x, double y) {}
    public record Window(Grid grid, Rectangle bounds, Raster samples, Double noData) {}
    private static final TIFFTagSet GDAL = new TIFFTagSet(List.of(
            new TIFFTag("GDAL_NODATA", 42113, 1 << TIFFTag.TIFF_ASCII)));

    public SatelliteResponse.Observation analyze(NasaHlsService.Granule granule, byte[] vi, byte[] qa,
            Polygon boundary, boolean includeLayer) {
        var values = read(vi, boundary);
        var quality = read(qa, boundary);
        if (!values.grid.equals(quality.grid) || !values.bounds.equals(quality.bounds)) throw NasaHlsService.provider();
        var field = SatelliteGeometry.project(boundary, values.grid.epsg, false);
        var features = new ArrayList<SatelliteResponse.Feature>();
        var valid = new ArrayList<Double>();
        int fieldPixels = 0, cloudPixels = 0;
        Rectangle bounds = values.bounds;
        for (int row = 0; row < bounds.height; row++) {
            for (int column = 0; column < bounds.width; column++) {
                double x = values.grid.x + (bounds.x + column) * 30;
                double y = values.grid.y - (bounds.y + row) * 30;
                var cell = SatelliteGeometry.cell(x, y);
                if (!field.covers(cell)) continue;
                fieldPixels++;
                int mask = quality.samples.getSample(column, row, 0);
                double raw = values.samples.getSampleDouble(column, row, 0);
                if (mask != 255 && (mask & 14) != 0) cloudPixels++;
                if (!validQuality(mask) || (quality.noData != null && mask == quality.noData)
                        || !validValue(raw, values.noData)) continue;
                double value = raw * 0.0001;
                valid.add(value);
                if (includeLayer) features.add(new SatelliteResponse.Feature("Feature",
                        SatelliteGeometry.boundary(SatelliteGeometry.project(cell, values.grid.epsg, true)), Map.of("value", value)));
            }
        }
        double fraction = fieldPixels == 0 ? 0 : (double) valid.size() / fieldPixels;
        boolean reliable = valid.size() >= 9 && fraction >= 0.5 && valid.size() * 900 / field.getArea() >= 0.5;
        String status = reliable ? "COMPLETE" : fieldPixels < 9 ? "INSUFFICIENT_PIXELS"
                : cloudPixels > 0 && (valid.isEmpty() || fraction < 0.5) ? "CLOUD_OBSCURED"
                : valid.isEmpty() ? "NO_VALID_DATA" : "INSUFFICIENT_VALID_PIXELS";
        SatelliteResponse.Statistics statistics = null;
        if (reliable) {
            Collections.sort(valid);
            int size = valid.size();
            double median = size % 2 == 0 ? (valid.get(size/2-1) + valid.get(size/2))/2 : valid.get(size/2);
            statistics = new SatelliteResponse.Statistics(valid.stream().mapToDouble(Double::doubleValue).average().orElseThrow(),
                    valid.get(0), valid.get(size-1), median);
        }
        return new SatelliteResponse.Observation(granule.id(), granule.collection(), "NASA HLS-VI v2.0",
                granule.observedAt(), java.time.Instant.parse(granule.observedAt()).atOffset(java.time.ZoneOffset.UTC).toLocalDate(),
                status, granule.cloudCover(), fieldPixels, valid.size(), cloudPixels, fraction, statistics,
                includeLayer ? new SatelliteResponse.Layer("FeatureCollection", reliable ? List.copyOf(features) : List.of()) : null);
    }

    public static boolean validQuality(int mask) {
        return mask >= 0 && mask < 255 && (mask & 63) == 0 && (mask & 192) != 192;
    }

    public static boolean validValue(double raw, Double noData) {
        return Double.isFinite(raw) && raw != -9999 && raw != -19999
                && (noData == null || raw != noData) && raw >= -10000 && raw <= 10000;
    }

    public Window read(byte[] bytes, Polygon field) {
        ImageReader reader = null;
        try (var input = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReadersByFormatName("TIFF");
            if (!readers.hasNext()) throw NasaHlsService.provider();
            reader = readers.next();
            reader.setInput(input, false, false);
            var param = (TIFFImageReadParam) reader.getDefaultReadParam();
            param.addAllowedTagSet(GeoTIFFTagSet.getInstance());
            param.addAllowedTagSet(GDAL);
            var directory = TIFFDirectory.createFromMetadata(reader.getImageMetadata(0));
            Grid grid = grid(directory, reader.getWidth(0), reader.getHeight(0));
            var envelope = SatelliteGeometry.project(field, grid.epsg, false).getEnvelopeInternal();
            int x0 = Math.max(0, (int) Math.floor((envelope.getMinX() - grid.x) / 30));
            int y0 = Math.max(0, (int) Math.floor((grid.y - envelope.getMaxY()) / 30));
            int x1 = Math.min(grid.width, (int) Math.ceil((envelope.getMaxX() - grid.x) / 30));
            int y1 = Math.min(grid.height, (int) Math.ceil((grid.y - envelope.getMinY()) / 30));
            if (x1 <= x0 || y1 <= y0 || (long)(x1-x0)*(y1-y0) > 1_000_000) throw NasaHlsService.provider();
            var region = new Rectangle(x0, y0, x1-x0, y1-y0);
            param.setSourceRegion(region);
            var image = reader.read(0, param);
            directory = TIFFDirectory.createFromMetadata(reader.getImageMetadata(0));
            var nodata = directory.getTIFFField(42113);
            Double fill = nodata == null ? null : Double.valueOf(nodata.getAsString(0).trim());
            if (image.getRaster().getNumBands() != 1) throw NasaHlsService.provider();
            return new Window(grid, region, image.getRaster(), fill);
        } catch (IOException | RuntimeException ex) {
            if (ex instanceof com.callmeagro.backend.exception.SatelliteException satellite) throw satellite;
            throw NasaHlsService.provider();
        } finally { if (reader != null) reader.dispose(); }
    }

    private Grid grid(TIFFDirectory directory, int width, int height) {
        var scale = directory.getTIFFField(33550);
        var tie = directory.getTIFFField(33922);
        var keys = directory.getTIFFField(34735);
        if (scale == null || tie == null || keys == null || directory.getTIFFField(34264) != null
                || scale.getCount() < 2 || tie.getCount() < 6 || keys.getCount() < 4
                || Math.abs(scale.getAsDouble(0)-30) > 0.00001 || Math.abs(scale.getAsDouble(1)-30) > 0.00001
                || width < 1 || height < 1 || width > 4000 || height > 4000) throw NasaHlsService.provider();
        int epsg = 0, rasterType = 1;
        for (int i = 4; i + 3 < keys.getCount(); i += 4) {
            if (keys.getAsInt(i) == 3072 && keys.getAsInt(i+1) == 0) epsg = keys.getAsInt(i+3);
            if (keys.getAsInt(i) == 1025) rasterType = keys.getAsInt(i+3);
        }
        if (rasterType != 1 || (epsg / 100 != 326 && epsg / 100 != 327)) throw NasaHlsService.provider();
        double x = tie.getAsDouble(3) - tie.getAsDouble(0)*30;
        double y = tie.getAsDouble(4) + tie.getAsDouble(1)*30;
        if (!Double.isFinite(x) || !Double.isFinite(y)) throw NasaHlsService.provider();
        return new Grid(width, height, epsg, x, y);
    }
}
