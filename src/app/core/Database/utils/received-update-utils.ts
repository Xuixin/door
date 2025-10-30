// received-update-utils.ts
export async function updateHandshake(
  handshake: any,
  parsedHandshake: any,
  doorId: string,
  received: any,
): Promise<void> {
  const updatedHandshake = { [doorId]: 'ok' };
  const newHandshake = JSON.stringify(updatedHandshake);
  console.log('Updating handshake:', {
    doorId,
    existing: parsedHandshake,
    updated: updatedHandshake,
  });
  const newEvent = JSON.stringify({
    type: 'RECEIVE',
    at: Date.now().toString(),
    actor: `DOOR-${doorId}`,
    status: 'SUCCESS',
  });
  try {
    await handshake.update({
      $set: {
        handshake: newHandshake,
        events: newEvent,
        client_updated_at: Date.now().toString(),
      },
    });
    console.log('✅ Handshake updated successfully:', received.transaction_id);
  } catch (error) {
    console.error('❌ Error updating handshake:', error);
  }
}
