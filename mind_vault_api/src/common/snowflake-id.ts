let sequence = 0;

export function nextSnowflakeId(): string {
  const timestamp = Date.now().toString();
  sequence = (sequence + 1) % 1000;
  return `${timestamp}${sequence.toString().padStart(3, '0')}`;
}
