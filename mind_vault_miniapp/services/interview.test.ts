import {
  createInterviewSession,
  streamInterviewAnswer,
  submitInterviewAnswer,
} from './interview';

const BASE64_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const storage = new Map<string, unknown>();
const requests: Array<Record<string, unknown>> = [];
let streamChunks: ArrayBuffer[] = [];
let streamFail: string | undefined;

/** 手工做 UTF-8 编码，测试环境没有小程序的 arrayBufferToBase64 */
function eventChunk(text: string): ArrayBuffer {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) as number;
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(
        0xe0 | (code >> 12),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f)
      );
    }
  }
  return new Uint8Array(bytes).buffer;
}

(globalThis as typeof globalThis & { wx: Record<string, unknown> }).wx = {
  getStorageSync(key: string) {
    return storage.get(key);
  },
  setStorageSync(key: string, value: unknown) {
    storage.set(key, value);
  },
  arrayBufferToBase64(buffer: ArrayBuffer) {
    const values = new Uint8Array(buffer);
    let output = '';
    for (let index = 0; index < values.length; index += 3) {
      const first = values[index];
      const second = values[index + 1];
      const third = values[index + 2];
      output += BASE64_ALPHABET[first >> 2];
      output += BASE64_ALPHABET[((first & 3) << 4) | (second >> 4)];
      output +=
        index + 1 < values.length
          ? BASE64_ALPHABET[((second & 15) << 2) | (third >> 6)]
          : '=';
      output += index + 2 < values.length ? BASE64_ALPHABET[third & 63] : '=';
    }
    return output;
  },
  request(options: Record<string, unknown>) {
    requests.push(options);
    if (options.enableChunked) {
      return {
        onChunkReceived(handler: (chunk: { data: ArrayBuffer }) => void) {
          if (streamFail) {
            (options.fail as (error: { errMsg: string }) => void)({
              errMsg: streamFail,
            });
            return;
          }
          for (const chunk of streamChunks) handler({ data: chunk });
          (options.success as (response: unknown) => void)({ statusCode: 200 });
        },
      };
    }
    const success = options.success as (response: unknown) => void;
    success({ statusCode: 200, header: {}, data: {} });
    return {};
  },
};

storage.set('mind-vault-session', {
  accessToken: 'test-token',
  user: { id: 'user_1' },
});

void run();

async function run() {
  await createInterviewSession({
    datasetId: 'dataset_1',
    topic: 'technical_fundamentals',
    intensity: 'deep',
    totalQuestions: 5,
  });
  await submitInterviewAnswer('session_1', '回答内容');

  if (requests[0]?.timeout !== 60_000) {
    throw new Error(
      `expected interview creation timeout, got ${String(requests[0]?.timeout)}`
    );
  }
  if (requests[1]?.timeout !== 120_000) {
    throw new Error(
      `expected interview answer timeout, got ${String(requests[1]?.timeout)}`
    );
  }

  // 流式：stage 事件交给 onStage，result 事件作为最终结果
  const stages: string[] = [];
  streamChunks = [
    eventChunk('event: stage\ndata: {"stage":"retrieving"}\n\n'),
    eventChunk('event: stage\ndata: {"stage":"evaluating"}\n\n'),
    eventChunk(
      'event: result\ndata: {"status":"IN_PROGRESS","nextQuestion":"下一题"}\n\n'
    ),
    eventChunk('event: done\ndata: {}\n\n'),
  ];
  const streamed = await streamInterviewAnswer(
    'session_1',
    '回答内容',
    (stage) => stages.push(stage)
  );
  if (JSON.stringify(stages) !== JSON.stringify(['retrieving', 'evaluating'])) {
    throw new Error(`expected streamed stages, got ${JSON.stringify(stages)}`);
  }
  if (streamed.status !== 'IN_PROGRESS' || streamed.nextQuestion !== '下一题') {
    throw new Error(
      `expected streamed result, got ${JSON.stringify(streamed)}`
    );
  }
  if (requests[2]?.timeout !== 300_000) {
    throw new Error(
      `expected stream timeout, got ${String(requests[2]?.timeout)}`
    );
  }

  // 流式：error 事件要把后端给的原因透出来，而不是笼统的失败
  streamChunks = [
    eventChunk(
      'event: error\ndata: {"message":"当前训练会话不可提交回答"}\n\n'
    ),
  ];
  const message = await streamInterviewAnswer(
    'session_1',
    '回答内容',
    () => undefined
  )
    .then(() => '')
    .catch((error: Error) => error.message);
  if (message !== '当前训练会话不可提交回答') {
    throw new Error(`expected streamed error message, got ${message}`);
  }

  // 流式：连接失败要让调用方 reject，避免界面一直停在等待态
  streamFail = 'request:fail timeout';
  streamChunks = [];
  const failed = await streamInterviewAnswer(
    'session_1',
    '回答内容',
    () => undefined
  )
    .then(() => '')
    .catch((error: Error) => error.message);
  if (failed !== 'request:fail timeout') {
    throw new Error(`expected stream failure message, got ${failed}`);
  }

  console.log('interview request timeout tests passed');
}
