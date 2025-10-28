import { CommonModule } from "@angular/common";
import { Component, inject, Input, OnInit, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { IonicModule } from "@ionic/angular";
import { ButtonModule } from "primeng/button";

import { BaseFlowController } from "../../../base-flow-controller.component";
import { RegistryContextHelper } from "../../../helpers/registry-context.helper";

@Component({
  selector: "app-user-data-form",
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule, ButtonModule],
  styles: [],
  templateUrl: "user-data-form.component.html",
})
export class UserDataFormComponent
  extends BaseFlowController
  implements OnInit
{
  @Input() override data: Record<string, any> = {};

  // Form fields
  prefix = "";
  firstName = "";
  lastName = "";
  studentNumber = "";

  // Validation errors
  errors: {
    prefix?: string;
    firstName?: string;
    lastName?: string;
    studentNumber?: string;
  } = {};

  // Form validation state
  isValid = false;

  override ngOnInit() {
    // Load existing data from context
    this.loadExistingData();
    this.validateForm();
  }

  /**
   * Load existing data from context
   */
  private loadExistingData(): void {
    const ctx = this.executionContext() as any;
    if (ctx?.user) {
      const user = ctx.user;

      // Parse name if it exists (รูปแบบ: "คำนำหน้า ชื่อ นามสกุล")
      if (user.name) {
        const nameParts = user.name.trim().split(" ");
        if (nameParts.length >= 3) {
          this.prefix = nameParts[0];
          this.firstName = nameParts[1];
          this.lastName = nameParts.slice(2).join(" ");
        } else if (nameParts.length === 2) {
          this.firstName = nameParts[0];
          this.lastName = nameParts[1];
        } else {
          this.firstName = user.name;
        }
      }

      // Load student_number
      this.studentNumber = user.student_number || "";
    }
  }

  /**
   * Validate form fields
   */
  validateForm(): void {
    const newErrors: typeof this.errors = {};

    // Validate prefix
    if (!this.prefix) {
      newErrors.prefix = "กรุณาเลือกคำนำหน้า";
    }

    // Validate first name
    if (!this.firstName || this.firstName.trim().length === 0) {
      newErrors.firstName = "กรุณากรอกชื่อ";
    } else if (this.firstName.trim().length < 2) {
      newErrors.firstName = "ชื่อต้องมีอย่างน้อย 2 ตัวอักษร";
    }

    // Validate last name
    if (!this.lastName || this.lastName.trim().length === 0) {
      newErrors.lastName = "กรุณากรอกนามสกุล";
    } else if (this.lastName.trim().length < 2) {
      newErrors.lastName = "นามสกุลต้องมีอย่างน้อย 2 ตัวอักษร";
    }

    // Validate student_number (required, ไม่น้อยกว่า 6 หลัก)
    if (!this.studentNumber || this.studentNumber.trim().length === 0) {
      newErrors.studentNumber = "กรุณากรอกรหัสนักศึกษาหรือเลขบัตรประชาชน";
    } else {
      const cleanNumber = this.studentNumber.replace(/[^0-9]/g, "");
      if (cleanNumber.length < 6) {
        newErrors.studentNumber = "ต้องมีอย่างน้อย 6 หลัก";
      }
    }

    this.errors = newErrors;
    this.isValid = Object.keys(newErrors).length === 0;
  }

  /**
   * Save data and proceed to next step
   */
  async saveAndNext(): Promise<void> {
    if (!this.isValid) {
      return;
    }

    try {
      const ctx = this.executionContext() as any;
      const fullName = `${
        this.prefix
      } ${this.firstName.trim()} ${this.lastName.trim()}`;

      const userData = {
        name: fullName,
        student_number: this.studentNumber.trim(),
        register_type: ctx?.user?.register_type || "WALK_IN",
        id_card_base64: ctx?.user?.id_card_base64 || "",
      };

      // Update context
      const updatedCtx = RegistryContextHelper.updateUser(ctx, userData);

      // Proceed to next step
      await this.next(updatedCtx);
    } catch (error) {
      console.error("Error in saveAndNext:", error);
      alert("เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่อีกครั้ง");
    }
  }

  /**
   * Close subflow and return to summary
   */
  async close(): Promise<void> {
    try {
      await this.closeSubflow({ cancelled: true });
    } catch (error) {
      console.error("Error closing subflow:", error);
    }
  }
}
