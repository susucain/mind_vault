export interface SseEvent {
  event: string;
  data: Record<string, unknown>;
}

export class SseParser {
  private buffer = '';
  private pendingBytes: number[] = [];

  push(chunk: ArrayBuffer): SseEvent[] {
    this.buffer += decodeChunk(chunk, this.pendingBytes);
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

function decodeChunk(chunk: ArrayBuffer, pendingBytes: number[]) {
  const base64 = wx.arrayBufferToBase64(chunk);
  const bytes = [...pendingBytes, ...decodeBase64(base64)];
  pendingBytes.length = 0;
  return decodeUtf8(bytes, pendingBytes);
}

function decodeUtf8(bytes: number[], pendingBytes: number[]) {
  for (let end = bytes.length; end >= 0; end -= 1) {
    const encoded = bytes
      .slice(0, end)
      .map((byte) => `%${byte.toString(16).padStart(2, '0')}`)
      .join('');
    try {
      const text = decodeURIComponent(encoded);
      pendingBytes.push(...bytes.slice(end));
      return text;
    } catch {
      // Try a shorter prefix until the incomplete trailing UTF-8 sequence is removed.
    }
  }
  pendingBytes.push(...bytes);
  return '';
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
  const lines = raw.replace(/\r\n?/g, '\n').split('\n');
  let event = '';
  const dataLines: string[] = [];
  for (const line of lines) {
    if (!line || line.startsWith(':')) continue;
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).replace(/^ /, ''));
    }
  }
  if (!event || dataLines.length === 0) return null;
  try {
    return {
      event,
      data: JSON.parse(dataLines.join('\n')) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}
