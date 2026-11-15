import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { timeout } from 'rxjs';
import { CropSuitabilityRequest, CropSuitabilityResponse } from '../models/crop-suitability';

@Injectable({ providedIn: 'root' })
export class CropSuitabilityService {
  private readonly http = inject(HttpClient);

  assess(request: CropSuitabilityRequest) {
    return this.http.post<CropSuitabilityResponse>('http://localhost:8080/api/crop-suitability', request).pipe(timeout(45000));
  }
}
