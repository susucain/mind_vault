export interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

export class SseParser {
  private buffer = '';

  push(chunk: ArrayBuffer): SseEvent[] {
    this.buffer += decodeChunk(chunk);
    const events: SseEvent[] = [];
    let separatorIndex = this.buffer.indexOf('\n\n');
    while (separatorIndex >= 0) {
      const raw = this.buffer.slice(0, separatorIndex);
      this.buffer = this.buffer.slice(separatorIndex + 2);
      const parsed = parseEvent(raw);
      if (parsed) events.push(parsed);
      separatorIndex = this.buffer.indexOf('\n\n');
    }
    return events;
  }
}

function decodeChunk(chunk: ArrayBuffer) {
  const base64 = wx.arrayBufferToBase64(chunk);
  return decodeBase64Utf8(base64);
}

function decodeBase64Utf8(base64: string) {
  const bytes = decodeBase64(base64);
  let encoded = '';
  for (const byte of bytes) {
    encoded += `%${byte.toString(16).padStart(2, '0')}`;
  }
  try {
    return decodeURIComponent(encoded);
  } catch {
    return String.fromCharCode(...bytes);
  }
}

function decodeBase64(value: string): number[] {
  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const normalized = value.replace(/=+$/, '');
  let accumulator = 0;
  let bits = 0;
  const bytes: number[] = [];
  for (const char of normalized) {
    const index = alphabet.indexOf(char);
    if (index < 0) continue;
    accumulator = (accumulator << 6) | index;
    bits += 6;
    while (bits >= 8) {
      bits -= 8;
      bytes.push((accumulator >> bits) & 0xff);
    }
  }
  return bytes;
}

export function parseEvent(raw: string): SseEvent | null {
  const lines = raw.split('\n');
  const event = lines
    .find((line) => line.startsWith('event:'))
    ?.slice(6)
    .trim();
  const data = lines
    .find((line) => line.startsWith('data:'))
    ?.slice(5)
    .trim();
  if (!event || !data) return null;
  try {
    return {
      event,
      data: JSON.parse(data) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}
