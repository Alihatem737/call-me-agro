import { AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild, ViewEncapsulation, inject } from '@angular/core';
import * as L from 'leaflet';
import { FarmCoordinates, hasCoordinates } from '../../services/plan-draft.service';
import type { FieldBoundary } from '../../models/field-boundary';
import { VegetationLayer, vegetationLegend } from '../../models/satellite-monitoring';

@Component({
  selector: 'app-farm-map',
  standalone: true,
  encapsulation: ViewEncapsulation.None,
  templateUrl: './farm-map.component.html',
  styleUrl: './farm-map.component.scss',
})
export class FarmMapComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() coordinates: FarmCoordinates | null = null;
  @Output() locationSelected = new EventEmitter<FarmCoordinates>();
  @Input() boundary: FieldBoundary | null = null;
  @Input() boundaryClosed = false;
  @Input() boundaryReadonly = false;
  @Input() vegetationLayer: VegetationLayer | null = null;
  @Output() boundaryChange = new EventEmitter<FieldBoundary>();
  @Output() closeBoundary = new EventEmitter<void>();
  @ViewChild('canvas', { static: true }) canvas!: ElementRef<HTMLDivElement>;
  private readonly zone = inject(NgZone);
  private map?: L.Map;
  private marker?: L.Marker;
  private tiles?: L.TileLayer;
  private observer?: ResizeObserver;
  private outline?: L.Polyline | L.Polygon;
  private vertices: L.Marker[] = [];
  private vegetation?: L.GeoJSON;
  loading = true;
  tileError = false;

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      const center: L.LatLngExpression = hasCoordinates(this.coordinates)
        ? [this.coordinates.latitude, this.coordinates.longitude] : [31.04, 31.38];
      this.map = L.map(this.canvas.nativeElement, { zoomControl: false, worldCopyJump: this.boundary === null, zoomAnimation: false })
        .setView(center, this.boundary === null ? 13 : 17);
      L.control.zoom({ position: 'bottomright' }).addTo(this.map);
      this.tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      });
      this.tiles.on('loading', () => this.zone.run(() => { this.loading = true; this.tileError = false; }));
      this.tiles.on('tileerror', () => this.zone.run(() => { this.tileError = true; }));
      this.tiles.on('load', () => this.zone.run(() => { this.loading = false; }));
      this.tiles.addTo(this.map);
      this.map.on('click', (event: L.LeafletMouseEvent) => this.select(event.latlng));
      this.restoreSelection();
      this.renderVegetation();
      this.fitBoundary();
      this.observer = new ResizeObserver(() => {
        this.map?.invalidateSize({ pan: false });
        if (this.boundaryClosed) this.fitBoundary();
      });
      this.observer.observe(this.canvas.nativeElement);
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['coordinates'] || changes['boundary'] || changes['boundaryClosed'] || changes['boundaryReadonly']) {
      this.restoreSelection();
    }
    if (changes['vegetationLayer']) this.renderVegetation();
    if (changes['coordinates'] || changes['boundary'] || changes['boundaryClosed']) this.fitBoundary();
  }

  focus(): void {
    this.canvas.nativeElement.focus();
  }

  selectCenter(): void {
    if (this.map) this.select(this.map.getCenter());
  }

  retryTiles(): void {
    this.tileError = false;
    this.tiles?.redraw();
  }

  private select(value: L.LatLng): void {
    const wrapped = value.wrap();
    const point = { latitude: wrapped.lat, longitude: wrapped.lng };
    if (!hasCoordinates(point)) return;
    if (this.boundary !== null) {
      if (!this.boundaryClosed && !this.boundaryReadonly) this.zone.run(() => this.boundaryChange.emit([...this.boundary!, point]));
      return;
    }
    this.showMarker(point);
    this.zone.run(() => this.locationSelected.emit(point));
  }

  private restoreSelection(): void {
    if (!this.map) return;
    if (this.boundary !== null) {
      this.renderBoundary();
      return;
    }
    if (!hasCoordinates(this.coordinates)) {
      this.marker?.remove();
      this.marker = undefined;
      return;
    }
    const point = L.latLng(this.coordinates.latitude, this.coordinates.longitude);
    if (!this.marker?.getLatLng().equals(point)) {
      this.showMarker(this.coordinates);
      this.map.panTo(point, { animate: false });
    }
  }

  private fitBoundary(): void {
    if (!this.map || this.boundary === null) return;
    if (this.boundary.length >= 3 && this.outline) {
      this.map.fitBounds(this.outline.getBounds(), { padding: [30, 30], maxZoom: 18, animate: false });
    } else if (hasCoordinates(this.coordinates)) {
      this.map.setView([this.coordinates.latitude, this.coordinates.longitude], 17, { animate: false });
    }
  }

  private renderBoundary(): void {
    const map = this.map!;
    const boundary = this.boundary!;
    const reference = boundary[0]?.longitude ?? 0;
    const positions = boundary.map(point => L.latLng(point.latitude,
      point.longitude + 360 * Math.round((reference - point.longitude) / 360)));
    this.outline?.remove();
    const options = { color: '#beeb52', weight: 3, dashArray: '8 6', fillOpacity: .16, interactive: false };
    this.outline = (this.boundaryClosed ? L.polygon(positions, options) : L.polyline(positions, options)).addTo(map);
    if (this.boundaryReadonly) {
      while (this.vertices.length) this.vertices.pop()?.remove();
      this.outline.bringToFront();
      return;
    }

    while (this.vertices.length > positions.length) this.vertices.pop()?.remove();
    positions.forEach((position, index) => {
      const existing = this.vertices[index];
      if (existing) {
        existing.setLatLng(position);
        return;
      }
      const label = `Field corner ${index + 1}`;
      const vertex = L.marker(position, {
        draggable: true, autoPan: true, title: label, alt: label,
        icon: L.divIcon({ className: 'field-map-vertex', iconSize: [16, 16], iconAnchor: [8, 8] }),
      }).addTo(map);
      vertex.on('click', () => {
        if (index === 0 && !this.boundaryClosed) this.zone.run(() => this.closeBoundary.emit());
      });
      vertex.on('dragend', () => {
        const { lat, lng } = vertex.getLatLng().wrap();
        this.zone.run(() => this.boundaryChange.emit(this.boundary!.map((point, corner) =>
          corner === index ? { latitude: lat, longitude: lng } : point)));
      });
      this.vertices.push(vertex);
    });
  }

  private renderVegetation(): void {
    if (!this.map) return;
    this.vegetation?.remove();
    this.vegetation = undefined;
    if (!this.vegetationLayer) return;
    this.vegetation = L.geoJSON(this.vegetationLayer, {
      style: feature => {
        const value = feature?.properties?.value;
        const shade = vegetationLegend.find(band => value < band.upper) ?? vegetationLegend[vegetationLegend.length - 1];
        return { color: shade.color, weight: 0.5, fillColor: shade.color, fillOpacity: .76, interactive: false };
      },
    }).addTo(this.map);
    this.outline?.bringToFront();
  }

  private showMarker(point: FarmCoordinates): void {
    if (!this.map) return;
    const position: L.LatLngExpression = [point.latitude, point.longitude];
    if (this.marker) {
      this.marker.setLatLng(position);
      return;
    }
    this.marker = L.marker(position, {
      draggable: true,
      autoPan: true,
      title: 'Selected farm location. Drag to move.',
      alt: 'Selected farm location',
      icon: L.divIcon({
        className: 'farm-map-pin',
        html: '<img src="assets/farm-location/selected-pin.svg" width="40" height="40" alt=""><img class="pin-center" src="assets/farm-location/pin-center.svg" width="12" height="12" alt="">',
        iconSize: [40, 40],
        iconAnchor: [20, 20],
      }),
    }).addTo(this.map).bindTooltip('Selected field', { permanent: true, direction: 'bottom', offset: [0, 20] });
    this.marker.on('dragend', () => { if (this.marker) this.select(this.marker.getLatLng()); });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.tiles?.off();
    this.map?.remove();
    this.map = undefined;
  }
}
