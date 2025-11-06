import { Injectable } from "@angular/core";

@Injectable({
  providedIn: 'root',
})
export class CameraUiService {
  constructor() {}

  captureAndSave(): Promise<void> {
    return Promise.resolve();
  }
}