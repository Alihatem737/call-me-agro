package com.callmeagro.backend.service;

import com.callmeagro.backend.dto.SatelliteRequest;
import com.callmeagro.backend.exception.SatelliteException;
import org.locationtech.jts.geom.*;
import org.locationtech.jts.operation.valid.IsValidOp;
import org.locationtech.proj4j.*;
import org.springframework.http.HttpStatus;
import java.util.ArrayList;
import java.util.List;

public final class SatelliteGeometry {
    private static final GeometryFactory FACTORY = new GeometryFactory();
    private SatelliteGeometry() {}

    public static Polygon validate(SatelliteRequest.Boundary boundary) {
        if (boundary == null || !"Polygon".equals(boundary.type()) || boundary.coordinates() == null
                || boundary.coordinates().isEmpty() || boundary.coordinates().size() > 20) throw invalid();
        var rings = new ArrayList<LinearRing>();
        int vertices = 0;
        for (var ring : boundary.coordinates()) {
            if (ring == null || ring.size() < 4 || (vertices += ring.size()) > 500) throw invalid();
            var coordinates = new ArrayList<Coordinate>();
            for (var point : ring) {
                if (point == null || point.size() != 2 || point.get(0) == null || point.get(1) == null) throw invalid();
                double x = point.get(0), y = point.get(1);
                if (!Double.isFinite(x) || !Double.isFinite(y) || x < -180 || x > 180 || y < -80 || y > 84) throw invalid();
                coordinates.add(new Coordinate(x, y));
            }
            if (!coordinates.get(0).equals2D(coordinates.get(coordinates.size() - 1))) throw invalid();
            rings.add(FACTORY.createLinearRing(coordinates.toArray(Coordinate[]::new)));
        }
        var polygon = FACTORY.createPolygon(rings.get(0), rings.subList(1, rings.size()).toArray(LinearRing[]::new));
        if (!new IsValidOp(polygon).isValid() || polygon.getArea() == 0
                || polygon.getEnvelopeInternal().getWidth() > 0.2 || polygon.getEnvelopeInternal().getHeight() > 0.2) throw invalid();
        double area = project(polygon, utmEpsg(polygon), false).getArea();
        if (area > 1_000_000) throw new SatelliteException(HttpStatus.BAD_REQUEST, "FIELD_TOO_LARGE", "Maximum field area is 100 hectares.");
        if (area < 8100) throw new SatelliteException(HttpStatus.UNPROCESSABLE_CONTENT, "FIELD_TOO_SMALL",
                "At least 8100 square meters (nine 30 m pixels) are required; this is an engineering reliability threshold.");
        return polygon;
    }

    public static int utmEpsg(Geometry geometry) {
        var p = geometry.getCentroid().getCoordinate();
        return (p.y < 0 ? 32700 : 32600) + Math.min(60, (int) Math.floor((p.x + 180) / 6) + 1);
    }

    public static Geometry project(Geometry geometry, int epsg, boolean inverse) {
        var factory = new CRSFactory();
        var geographic = factory.createFromParameters("WGS84", "+proj=longlat +datum=WGS84 +no_defs");
        int zone = epsg % 100;
        if ((epsg / 100 != 326 && epsg / 100 != 327) || zone < 1 || zone > 60) {
            throw new SatelliteException(HttpStatus.BAD_GATEWAY, "PROVIDER_ERROR", "Unsupported raster coordinate system.");
        }
        var projected = factory.createFromParameters("UTM", "+proj=utm +zone=" + zone
                + (epsg / 100 == 327 ? " +south" : "") + " +datum=WGS84 +units=m +no_defs");
        var transform = new CoordinateTransformFactory().createTransform(inverse ? projected : geographic, inverse ? geographic : projected);
        var result = geometry.copy();
        result.apply((CoordinateFilter) coordinate -> {
            var target = transform.transform(new ProjCoordinate(coordinate.x, coordinate.y), new ProjCoordinate());
            coordinate.x = target.x;
            coordinate.y = target.y;
        });
        result.geometryChanged();
        return result;
    }

    public static Polygon cell(double x, double y) {
        return FACTORY.createPolygon(new Coordinate[]{new Coordinate(x,y), new Coordinate(x+30,y),
                new Coordinate(x+30,y-30), new Coordinate(x,y-30), new Coordinate(x,y)});
    }

    public static SatelliteRequest.Boundary boundary(Geometry polygon) {
        var rings = new ArrayList<List<List<Double>>>();
        var p = (Polygon) polygon;
        rings.add(points(p.getExteriorRing()));
        for (int i = 0; i < p.getNumInteriorRing(); i++) rings.add(points(p.getInteriorRingN(i)));
        return new SatelliteRequest.Boundary("Polygon", List.copyOf(rings));
    }

    private static List<List<Double>> points(LineString line) {
        var result = new ArrayList<List<Double>>();
        for (var c : line.getCoordinates()) result.add(List.of(c.x, c.y));
        return List.copyOf(result);
    }

    private static SatelliteException invalid() {
        return new SatelliteException(HttpStatus.BAD_REQUEST, "INVALID_BOUNDARY",
                "Use a valid closed, non-self-intersecting GeoJSON Polygon in longitude,latitude order; maximum 500 vertices and 0.2 degree extent, latitude -80 to 84.");
    }
}
