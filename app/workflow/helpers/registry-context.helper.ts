/**
 * Registry Context Helper
 * จัดการ context data สำหรับ Registry Workflow
 */

export interface RegistryUser {
  name: string;
  student_number: string;
  register_type: string;
  id_card_base64: string;
}

export interface RegistryContext {
  user: RegistryUser;
  door_permission: string[];
  register_type: string;
}

export interface RegistryTransaction {
  id: string;
  name: string;
  student_number: string;
  register_type: string;
  door_permission: string[];
  status: "PENDING" | "IN" | "OUT";
  client_created_at: string;
  client_updated_at: string;
}

export interface FileData {
  file_blob: Blob;
  file_type: string;
  file_category: string;
}

export class RegistryContextHelper {
  /**
   * เพิ่มไฟล์ลง context
   */
  static async addFile(
    ctx: RegistryContext,
    file: FileData
  ): Promise<RegistryContext> {
    // Convert Blob to base64
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = reader.result as string;
        const updatedCtx = {
          ...ctx,
          user: {
            ...ctx.user,
            id_card_base64: base64,
          },
        };
        resolve(updatedCtx);
      };
      reader.readAsDataURL(file.file_blob);
    });
  }

  /**
   * อัพเดทข้อมูลผู้ใช้
   */
  static updateUser(
    ctx: RegistryContext,
    userData: Partial<RegistryUser>
  ): RegistryContext {
    return {
      ...ctx,
      user: {
        ...ctx.user,
        ...userData,
      },
    };
  }

  /**
   * อัพเดทประตูที่เลือก
   */
  static updateDoorPermission(
    ctx: RegistryContext,
    doors: string[]
  ): RegistryContext {
    return {
      ...ctx,
      door_permission: doors,
    };
  }

  /**
   * ตรวจสอบว่ามีรูปบัตรหรือไม่
   */
  static hasIdCard(ctx: RegistryContext): boolean {
    return !!(ctx.user?.id_card_base64 && ctx.user.id_card_base64.length > 0);
  }

  /**
   * ตรวจสอบว่ามีข้อมูลผู้ใช้ครบถ้วนหรือไม่
   */
  static hasUserData(ctx: RegistryContext): boolean {
    return !!(
      ctx.user?.name &&
      ctx.user?.student_number &&
      ctx.user.name.trim().length > 0 &&
      ctx.user.student_number.trim().length > 0
    );
  }

  /**
   * ตรวจสอบว่าเลือกประตูแล้วหรือไม่
   */
  static hasDoorPermission(ctx: RegistryContext): boolean {
    return !!(ctx.door_permission && ctx.door_permission.length > 0);
  }

  /**
   * ตรวจสอบว่าข้อมูลครบถ้วนหรือไม่
   */
  static isComplete(ctx: RegistryContext): boolean {
    return (
      this.hasIdCard(ctx) &&
      this.hasUserData(ctx) &&
      this.hasDoorPermission(ctx)
    );
  }

  /**
   * ดึงไฟล์ตาม category
   */
  static getFileByCategory(
    ctx: RegistryContext,
    category: string
  ): FileData | null {
    if (category === "id-card" && ctx.user?.id_card_base64) {
      // Convert base64 back to Blob
      const base64Data = ctx.user.id_card_base64.split(",")[1];
      const byteCharacters = atob(base64Data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: "image/jpeg" });

      return {
        file_blob: blob,
        file_type: "image/jpeg",
        file_category: "id-card",
      };
    }
    return null;
  }

  /**
   * ดึงชื่อเต็มของผู้ใช้
   */
  static getUserFullName(ctx: RegistryContext): string {
    return ctx.user?.name || "";
  }

  /**
   * ดึงหมายเลขบัตรประชาชน/รหัสนักศึกษา
   */
  static getUserStudentNumber(ctx: RegistryContext): string {
    return ctx.user?.student_number || "";
  }

  /**
   * ดึงชื่อประตูที่เลือก
   */
  static getDoorNames(ctx: RegistryContext): string[] {
    if (!ctx.door_permission || ctx.door_permission.length === 0) {
      return [];
    }

    // Map door IDs to names
    const doorMap: Record<string, string> = {
      "1": "ประตู 1",
      "2": "ประตู 2",
      "3": "ประตู 3",
      "4": "ประตู 4",
      "5": "ประตู 5",
    };

    return ctx.door_permission.map((id) => doorMap[id] || `ประตู ${id}`);
  }

  /**
   * สร้าง context เริ่มต้น
   */
  static createInitialContext(): RegistryContext {
    return {
      user: {
        name: "",
        student_number: "",
        register_type: "WALK_IN",
        id_card_base64: "",
      },
      door_permission: [],
      register_type: "WALK_IN",
    };
  }
}
