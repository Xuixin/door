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
  let hasHandshake: any = {};
  const handshakeValue = handshake.handshake || '{}';
  try {
    try {
      hasHandshake = JSON.parse(handshakeValue);
      if (
        !hasHandshake ||
        typeof hasHandshake !== 'object' ||
        Array.isArray(hasHandshake)
      ) {
        throw new Error('Parsed value is not an object');
      }
    } catch (firstParseError) {
      // Extract valid JSON objects from malformed string
      console.warn(
        'Initial parse failed, will try extracting valid objects. Error:',
        firstParseError,
      );
      const jsonObjects: any[] = [];
      let start = -1;
      let depth = 0;
      for (let i = 0; i < handshakeValue.length; i++) {
        if (handshakeValue[i] === '{') {
          if (start === -1) start = i;
          depth++;
        } else if (handshakeValue[i] === '}') {
          depth--;
          if (depth === 0 && start !== -1) {
            const jsonStr = handshakeValue.substring(start, i + 1);
            try {
              const parsed = JSON.parse(jsonStr);
              if (
                parsed &&
                typeof parsed === 'object' &&
                !Array.isArray(parsed)
              ) {
                jsonObjects.push(parsed);
              }
            } catch (_) {}
            start = -1;
          }
        }
      }
      if (jsonObjects.length > 0) {
        hasHandshake = Object.assign({}, ...jsonObjects);
        console.log(
          'Extracted and merged',
          jsonObjects.length,
          'objects from malformed handshake data',
        );
      } else {
        hasHandshake = {};
      }
    }
  } catch (parseError) {
    console.error(
      'Failed to parse handshake, init new object:',
      parseError,
      handshake.handshake,
    );
    hasHandshake = {};
  }
  return hasHandshake;
}
