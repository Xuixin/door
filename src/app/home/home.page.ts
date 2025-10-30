import {
  Component,
  OnInit,
  OnDestroy,
  ChangeDetectorRef,
  inject,
  signal,
  ViewChild,
  ElementRef,
  computed,
} from '@angular/core';
import {
  ModalController,
  LoadingController,
  AlertController,
} from '@ionic/angular';
import { TransactionService } from '../core/Database/facade/transaction.service';
import { DatabaseService } from '../core/Database/rxdb.service';
import { DoorApiService } from '../core/Api/grapgql/door.service';
import { DoorSelectionModalComponent } from '../components/door-selection-modal/door-selection-modal.component';
import { ClientIdentityService } from '../core/identity/client-identity.service';

interface AccessResult {
  hasAccess: boolean;
  studentName?: string;
  message: string;
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit, OnDestroy {
  @ViewChild('studentInput') studentInput?: ElementRef<HTMLInputElement>;

  currentDate = new Date();
  currentTime = new Date();

  // Inject services
  private readonly transactionService = inject(TransactionService);
  private readonly databaseService = inject(DatabaseService);
  private readonly identityService = inject(ClientIdentityService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly doorApiService = inject(DoorApiService);
  private readonly modalController = inject(ModalController);
  private readonly loadingController = inject(LoadingController);
  private readonly alertController = inject(AlertController);

  // Signals from service
  public readonly transactions = this.transactionService.transactions;
  public readonly stats = this.transactionService.stats;
  public readonly recentTransactions =
    this.transactionService.recentTransactions;

  // Computed signal for inCount (used in template)
  public readonly inCount = () => this.stats().in;

  // Door system properties
  public studentNumber = '';
  public isChecking = false;
  public accessResult = signal<AccessResult | null>(null);
  public currentDoorName = signal<string>('');

  private timeInterval?: any;
  private resultTimeout?: any;

  constructor() {
    // Update time every minute
    this.timeInterval = setInterval(() => {
      this.currentTime = new Date();
      this.currentDate = new Date();
      this.cdr.detectChanges();
    }, 60000);
  }

  async ngOnInit() {
    // Load door name from preferences
    await this.loadDoorName();

    // Wait for database to be ready
    this.databaseService.initState$.subscribe((state) => {
      if (state === 'ready') {
        // Database is ready
      }
    });
  }

  /**
   * Load door name from preferences
   */
  private async loadDoorName() {
    try {
      const doorName = await this.identityService.getDoorName();
      if (doorName) {
        this.currentDoorName.set(doorName);
      } else {
        this.currentDoorName.set('ประตูไม่ระบุ');
      }
    } catch (error) {
      console.error('Error loading door name:', error);
      this.currentDoorName.set('ประตูไม่ระบุ');
    }
  }

  /**
   * Change door functionality
   */
  async changeDoor() {
    // Show confirmation alert
    const alert = await this.alertController.create({
      header: 'เปลี่ยนประตู',
      message: 'คุณต้องการเปลี่ยนประตูหรือไม่? ข้อมูลปัจจุบันจะถูกลบ',
      buttons: [
        {
          text: 'ยกเลิก',
          role: 'cancel',
        },
        {
          text: 'ยืนยัน',
          handler: async () => {
            await this.performDoorChange();
          },
        },
      ],
    });

    await alert.present();
  }

  /**
   * Perform door change
   */
  private async performDoorChange() {
    let loading: HTMLIonLoadingElement | null = null;

    try {
      // Show loading
      loading = await this.loadingController.create({
        message: 'กำลังล้างข้อมูล...',
        spinner: 'crescent',
        translucent: true,
        backdropDismiss: false,
      });
      await loading.present();

      // Check if database is initializing
      if (this.databaseService.isInitializing) {
        throw new Error('Database is currently initializing. Please wait.');
      }

      // Destroy old database
      console.log('🗑️ Destroying old database...');
      await this.databaseService.destroy();

      // Remove door preference
      await this.identityService.removeClientId();

      // Dismiss loading
      if (loading) {
        await loading.dismiss();
        loading = null;
      }

      // Open door selection modal
      const modal = await this.modalController.create({
        component: DoorSelectionModalComponent,
        backdropDismiss: false,
        cssClass: 'door-selection-modal',
      });

      await modal.present();
      const { data } = await modal.onDidDismiss();

      if (data) {
        console.log(`✅ Door changed to: ${data}`);
        // Database is already initialized by the modal
      }
    } catch (error) {
      console.error('❌ Error changing door:', error);

      if (loading) {
        await loading.dismiss();
      }

      const alert = await this.alertController.create({
        header: 'เกิดข้อผิดพลาด',
        message: 'ไม่สามารถเปลี่ยนประตูได้ กรุณาลองใหม่อีกครั้ง',
        buttons: ['ตกลง'],
      });

      await alert.present();
    }
  }

  ngOnDestroy() {
    if (this.timeInterval) {
      clearInterval(this.timeInterval);
    }
    if (this.resultTimeout) {
      clearTimeout(this.resultTimeout);
    }
  }

  /**
   * Add number from numpad
   */
  addNumber(num: number) {
    this.studentNumber += num.toString();
    this.focusInput();
  }

  /**
   * Clear input
   */
  clearInput() {
    this.studentNumber = '';
    this.focusInput();
  }

  /**
   * Backspace
   */
  backspace() {
    if (this.studentNumber.length > 0) {
      this.studentNumber = this.studentNumber.slice(0, -1);
    }
    this.focusInput();
  }

  /**
   * Focus input field
   */
  private focusInput() {
    setTimeout(() => {
      this.studentInput?.nativeElement.focus();
    }, 0);
  }

  /**
   * Check student access
   */
  async checkAccess() {
    if (!this.studentNumber.trim()) {
      return;
    }

    // Clear any existing timeout
    if (this.resultTimeout) {
      clearTimeout(this.resultTimeout);
    }

    this.isChecking = true;
    this.accessResult.set(null);

    try {
      console.log('🔍 Checking access for student:', this.studentNumber);

      // Get current door ID
      const currentDoorId = await this.identityService.getClientId();
      if (!currentDoorId) {
        this.accessResult.set({
          hasAccess: false,
          message: 'ไม่พบข้อมูลประตู กรุณาติดต่อเจ้าหน้าที่',
        });
        this.autoResetAfterResult();
        return;
      }

      // Check if database is ready
      if (!this.databaseService.isInitialized) {
        this.accessResult.set({
          hasAccess: false,
          message: 'ระบบฐานข้อมูลยังไม่พร้อม กรุณารอสักครู่',
        });
        this.autoResetAfterResult();
        return;
      }

      // Query local database for student
      const studentDoc = await this.databaseService.db.txn
        .findOne({
          selector: { student_number: this.studentNumber.trim() } as any,
        })
        .exec();

      console.log('Student document:', studentDoc);

      if (!studentDoc) {
        this.accessResult.set({
          hasAccess: false,
          message: 'ไม่พบข้อมูลการลงทะเบียน',
        });
        this.autoResetAfterResult();
        return;
      }

      // Check if student has access to current door
      const student = studentDoc as any;
      const doorPermissions = Array.isArray(student.door_permission)
        ? student.door_permission
        : student.door_permission.split(',').map((s: string) => s.trim());

      const hasDoorPermission = doorPermissions.includes(currentDoorId);
      const isStatusIn = student.status === 'IN';

      if (isStatusIn && hasDoorPermission) {
        this.accessResult.set({
          hasAccess: true,
          studentName: student.name,
          message: 'คุณมีสิทธิ์เข้า',
        });
        console.log('✅ Access granted for:', student.name);
      } else {
        let message = 'ไม่มีสิทธิ์เข้า';
        if (!isStatusIn) {
          message = 'สถานะไม่ถูกต้อง (ไม่ได้ลงทะเบียนเข้า)';
        } else if (!hasDoorPermission) {
          message = 'ไม่มีสิทธิ์เข้าประตูนี้';
        }

        this.accessResult.set({
          hasAccess: false,
          studentName: student.name,
          message: message,
        });
        console.log('❌ Access denied for:', student.name, 'Reason:', message);
      }

      // Auto reset after showing result
      this.autoResetAfterResult();
    } catch (error) {
      console.error('❌ Error checking access:', error);
      this.accessResult.set({
        hasAccess: false,
        message: 'เกิดข้อผิดพลาดในการตรวจสอบ กรุณาลองใหม่อีกครั้ง',
      });
      this.autoResetAfterResult();
    } finally {
      this.isChecking = false;
    }
  }

  /**
   * Auto reset after showing result (3 seconds)
   */
  private autoResetAfterResult() {
    this.resultTimeout = setTimeout(() => {
      this.resetForm();
    }, 3000); // Show result for 3 seconds
  }

  /**
   * Reset form to initial state
   */
  private resetForm() {
    this.accessResult.set(null);
    this.studentNumber = '';
    this.focusInput();
    this.cdr.detectChanges();
  }

  /**
   * Clear access result (manual)
   */
  clearResult() {
    if (this.resultTimeout) {
      clearTimeout(this.resultTimeout);
    }
    this.resetForm();
  }
}
