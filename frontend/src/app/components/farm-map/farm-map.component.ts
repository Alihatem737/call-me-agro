import { AfterViewInit, Component, ElementRef, EventEmitter, Input, NgZone, OnChanges, OnDestroy, Output, ViewChild, ViewEncapsulation, inject } from '@angular/core';
import * as L from 'leaflet';
import { FarmCoordinates, hasCoordinates } from '../../services/plan-draft.service';

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
  @ViewChild('canvas', { static: true }) canvas!: ElementRef<HTMLDivElement>;
  private readonly zone = inject(NgZone);
  private map?: L.Map;
  private marker?: L.Marker;
  private tiles?: L.TileLayer;
  private observer?: ResizeObserver;
  loading = true;
  tileError = false;

  ngAfterViewInit(): void {
    this.zone.runOutsideAngular(() => {
      const center: L.LatLngExpression = hasCoordinates(this.coordinates)
        ? [this.coordinates.latitude, this.coordinates.longitude] : [31.04, 31.38];
      this.map = L.map(this.canvas.nativeElement, { zoomControl: false, worldCopyJump: true, zoomAnimation: false }).setView(center, 13);
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
      this.observer = new ResizeObserver(() => this.map?.invalidateSize({ pan: false }));
      this.observer.observe(this.canvas.nativeElement);
    });
  }

  ngOnChanges(): void {
    this.restoreSelection();
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
    this.showMarker(point);
    this.zone.run(() => this.locationSelected.emit(point));
  }

  private restoreSelection(): void {
    if (!this.map) return;
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
