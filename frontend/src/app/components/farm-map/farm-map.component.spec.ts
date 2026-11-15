import { TestBed } from '@angular/core/testing';
import * as L from 'leaflet';
import { FarmMapComponent } from './farm-map.component';
import { hasCoordinates } from '../../services/plan-draft.service';

describe('FarmMapComponent', () => {
  beforeEach(async () => {
    spyOn(L.TileLayer.prototype, 'getTileUrl').and.returnValue('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
    await TestBed.configureTestingModule({ imports: [FarmMapComponent] }).compileComponents();
  });

  it('starts without a selected pin and selects from an actual map click', () => {
    const fixture = TestBed.createComponent(FarmMapComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const selected = spyOn(component.locationSelected, 'emit');
    expect(fixture.nativeElement.querySelector('.leaflet-marker-icon')).toBeNull();
    const canvas = component.canvas.nativeElement;
    const bounds = canvas.getBoundingClientRect();
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: bounds.left + bounds.width / 2, clientY: bounds.top + bounds.height / 2 }));
    expect(selected).toHaveBeenCalled();
    expect(hasCoordinates(selected.calls.mostRecent().args[0])).toBeTrue();
    expect(fixture.nativeElement.querySelectorAll('.leaflet-marker-icon').length).toBe(1);
  });

  it('restores coordinates, supports dragging, and updates the existing pin', () => {
    const fixture = TestBed.createComponent(FarmMapComponent);
    fixture.componentRef.setInput('coordinates', { latitude: 31.04, longitude: 31.38 });
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const selected = spyOn(component.locationSelected, 'emit');
    const marker = component['marker']!;
    expect(marker.getLatLng().equals([31.04, 31.38])).toBeTrue();
    expect(marker.dragging?.enabled()).toBeTrue();
    marker.setLatLng([30.5, 31.5]).fire('dragend');
    expect(selected).toHaveBeenCalledWith({ latitude: 30.5, longitude: 31.5 });
    component['map']!.fire('click', { latlng: L.latLng(30.75, 31.75) });
    expect(fixture.nativeElement.querySelectorAll('.leaflet-marker-icon').length).toBe(1);
    expect(marker.getLatLng().equals([30.75, 31.75])).toBeTrue();
  });

  it('zooms and pans without selecting a location and supports keyboard selection through the center button', async () => {
    const fixture = TestBed.createComponent(FarmMapComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const selected = spyOn(component.locationSelected, 'emit');
    const map = component['map']!;
    expect(map.dragging.enabled()).toBeTrue();
    expect(map.keyboard.enabled()).toBeTrue();
    const zoom = map.getZoom();
    const zoomed = new Promise<void>(resolve => map.once('zoomend', () => resolve()));
    (fixture.nativeElement.querySelector('.leaflet-control-zoom-in') as HTMLAnchorElement).click();
    await zoomed;
    expect(map.getZoom()).toBe(zoom + 1);
    map.panTo([30.5, 31.5], { animate: false });
    expect(selected).not.toHaveBeenCalled();
    (fixture.nativeElement.querySelector('.select-center') as HTMLButtonElement).click();
    expect(selected).toHaveBeenCalled();
    expect(selected.calls.mostRecent().args[0]!.latitude).toBeCloseTo(30.5, 3);
  });

  it('shows tile errors and retries without clearing the selected point', () => {
    const fixture = TestBed.createComponent(FarmMapComponent);
    fixture.componentRef.setInput('coordinates', { latitude: 0, longitude: 0 });
    fixture.detectChanges();
    const component = fixture.componentInstance;
    component['tiles']!.fire('tileerror');
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Map tiles could not be loaded');
    const redraw = spyOn(component['tiles']!, 'redraw');
    component.retryTiles();
    expect(redraw).toHaveBeenCalled();
    expect(component['marker']!.getLatLng().equals([0, 0])).toBeTrue();
  });

  it('removes its map and resize observer on destroy', () => {
    const fixture = TestBed.createComponent(FarmMapComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const map = component['map']!;
    const remove = spyOn(map, 'remove').and.callThrough();
    const disconnect = spyOn(component['observer']!, 'disconnect').and.callThrough();
    fixture.destroy();
    expect(remove).toHaveBeenCalled();
    expect(disconnect).toHaveBeenCalled();
  });

  it('can be destroyed immediately after zooming without a delayed transition error', async () => {
    const errors: string[] = [];
    const captureError = (event: ErrorEvent) => errors.push(event.message);
    window.addEventListener('error', captureError);
    const fixture = TestBed.createComponent(FarmMapComponent);
    try {
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.leaflet-control-zoom-in') as HTMLAnchorElement).click();
      fixture.destroy();
      await new Promise<void>(resolve => setTimeout(resolve, 350));
      expect(errors).toEqual([]);
    } finally {
      window.removeEventListener('error', captureError);
    }
  });

  it('accepts zero coordinates and rejects missing, out-of-range and non-finite values', () => {
    expect(hasCoordinates({ latitude: 0, longitude: 0 })).toBeTrue();
    for (const value of [null, {}, { latitude: 31 }, { latitude: 91, longitude: 31 }, { latitude: 31, longitude: 181 }, { latitude: NaN, longitude: 31 }, { latitude: 31, longitude: Infinity }]) {
      expect(hasCoordinates(value)).toBeFalse();
    }
  });
});
