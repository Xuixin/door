// received-parse-utils.ts
export function parseEventsArray(handshake: any): any[] {
  try {
    if (!handshake.events) return [];
    const parsed = JSON.parse(handshake.events);
    if (Array.isArray(parsed)) return parsed;
    console.warn('Events field is not array, fallback to empty.');
    return [];
  } catch (e) {
    console.warn(
      'Failed to parse events, fallback to empty.',
      handshake.events,
      e,
    );
    return [];
  }
}

export function parseHandshakeField(handshake: any): Record<string, any> {
  const handshakeValue = handshake.handshake || '{}';
  try {
    // ถ้าไม่ได้ขึ้นต้นด้วย '[' แสดงว่าน่าจะเป็น object หลายตัวติดกัน
    const normalized = handshakeValue.trim().startsWith('[')
      ? handshakeValue
      : `[${handshakeValue}]`;

    const arr = JSON.parse(normalized); // ตอนนี้เป็น array แล้ว
    const merged = Object.assign({}, ...arr); // รวม object ทั้งหมดเข้าด้วยกัน

    return merged;
  } catch (err) {
    console.warn('Failed to parse handshake:', err, handshakeValue);
    return {};
  }
}
