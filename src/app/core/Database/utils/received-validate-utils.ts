// received-validate-utils.ts
export function validateDoorPermission(
  txn: any,
  doorId: string,
  received: any,
): boolean {
  try {
    const doorPermissions = Array.isArray(txn.door_permission)
      ? txn.door_permission
      : (txn.door_permission || '').split(',').map((s: string) => s.trim());
    if (!doorPermissions.includes(doorId)) {
      console.warn(
        `Transaction ${received.transaction_id} does not have permission for door ${doorId}`,
      );
      return false;
    }
    return true;
  } catch (e) {
    console.error('Error checking doorPermission', e);
    return false;
  }
}

export function hasReceiveEvent(eventsArray: any[], doorId: string): boolean {
  const exists = eventsArray.some(
    (event: any) =>
      event.type === 'RECEIVE' && event.actor === `DOOR-${doorId}`,
  );
  if (exists) {
    console.log(
      `RECEIVE event already exists for DOOR-${doorId}, skipping event addition`,
    );
  }
  return exists;
}

export function hasDoorAcknowledgment(
  parsedHandshake: any,
  doorId: string,
): boolean {
  if (parsedHandshake && parsedHandshake[doorId] === 'ok') {
    console.log(
      `Handshake already has door acknowledgment for ${doorId}, skipping update`,
    );
    return true;
  }
  return false;
}
