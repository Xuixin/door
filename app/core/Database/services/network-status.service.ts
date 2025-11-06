import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, fromEvent } from 'rxjs';
import { Capacitor } from '@capacitor/core';
import { Network } from '@capacitor/network';

@Injectable({
  providedIn: 'root',
})
export class NetworkStatusService {
  private isOnlineSubject = new BehaviorSubject<boolean>(true);
  public readonly isOnline$: Observable<boolean> =
    this.isOnlineSubject.asObservable();

  private isNativePlatform: boolean;

  constructor() {
    this.isNativePlatform = Capacitor.isNativePlatform();
    this.initialize();
  }

  private async initialize() {
    if (this.isNativePlatform) {
      // Use Capacitor Network plugin for native platforms
      await this.initializeNativeNetwork();
    } else {
      // Use browser navigator for web platform
      this.initializeWebNetwork();
    }
  }

  private async initializeNativeNetwork() {
    // Get initial status
    const status = await Network.getStatus();
    this.isOnlineSubject.next(status.connected);

    // Subscribe to network status changes
    Network.addListener('networkStatusChange', (status) => {
      this.isOnlineSubject.next(status.connected);
      console.log('📡 Network status changed:', {
        connected: status.connected,
        connectionType: status.connectionType,
      });
    });
  }

  private initializeWebNetwork() {
    // Set initial status from navigator
    const initialOnline = navigator.onLine;
    this.isOnlineSubject.next(initialOnline);

    // Listen to online/offline events
    fromEvent(window, 'online').subscribe(() => {
      this.isOnlineSubject.next(true);
      console.log('🌐 Browser is now online');
    });

    fromEvent(window, 'offline').subscribe(() => {
      this.isOnlineSubject.next(false);
      console.log('⚠️ Browser is now offline');
    });
  }

  /**
   * Get current online status synchronously
   */
  isOnline(): boolean {
    return this.isOnlineSubject.value;
  }

  /**
   * Get platform type
   */
  getPlatform(): 'native' | 'web' {
    return this.isNativePlatform ? 'native' : 'web';
  }
}
