import { DeviceEventFacade } from './facade.service';

export async function createDeviceEvents(
  deviceEventFacade: DeviceEventFacade,
  docs: any[],
  sentTo: 'miniserver' | 'cloud',
): Promise<void> {
  const promises = docs.map(async (doc: any) => {
    const transactionId = doc.id;
    if (!transactionId) {
      console.warn(
        '⚠️ [createDeviceEvents] Transaction document missing id, skipping device event creation',
      );
      return;
    }

    try {
      await deviceEventFacade.createIfNotExists(transactionId, sentTo);
    } catch (error: any) {
      console.error(
        `❌ [createDeviceEvents] Error creating device event for transaction ${transactionId}:`,
        error.message,
      );
    }
  });

  await Promise.allSettled(promises);
}
