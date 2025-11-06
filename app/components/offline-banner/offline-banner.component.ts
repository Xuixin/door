import { Component, OnInit, OnDestroy, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { NetworkStatusService } from '../../core/Database/services/network-status.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-offline-banner',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      *ngIf="!isOnline"
      class="offline-banner"
      role="alert"
      aria-live="polite"
    >
      <div class="banner-content">
        <span class="banner-icon">📶</span>
        <span class="banner-message">คุณกำลังทำงานแบบออฟไลน์</span>
      </div>
    </div>
  `,
  styles: [
    `
      .offline-banner {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        background: linear-gradient(135deg, #ff6b6b 0%, #ee5a6f 100%);
        color: white;
        padding: 0.75rem 1rem;
        z-index: 10000;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        animation: slideDown 0.3s ease-out;
      }

      @keyframes slideDown {
        from {
          transform: translateY(-100%);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }

      .banner-content {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.5rem;
        max-width: 1200px;
        margin: 0 auto;
      }

      .banner-icon {
        font-size: 1.25rem;
      }

      .banner-message {
        font-size: 0.875rem;
        font-weight: 500;
        text-align: center;
      }

      @media (max-width: 640px) {
        .banner-message {
          font-size: 0.75rem;
        }
      }
    `,
  ],
})
export class OfflineBannerComponent implements OnInit, OnDestroy {
  private readonly networkStatus = inject(NetworkStatusService);
  private networkSubscription?: Subscription;

  isOnline = true;

  ngOnInit(): void {
    // Set initial state
    this.isOnline = this.networkStatus.isOnline();

    // Subscribe to network status changes
    this.networkSubscription = this.networkStatus.isOnline$.subscribe(
      (online) => {
        this.isOnline = online;
      },
    );
  }

  ngOnDestroy(): void {
    if (this.networkSubscription) {
      this.networkSubscription.unsubscribe();
    }
  }
}
