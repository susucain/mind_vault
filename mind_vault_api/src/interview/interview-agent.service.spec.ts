import { InterviewAgentService } from './interview-agent.service';

function buildAgent() {
  const models = {
    generateQuestion: jest
      .fn()
      .mockResolvedValue({ question: '请介绍项目中的缓存设计。' }),
  };
  const retrieval = { hybrid: jest.fn().mockResolvedValue({ hits: [] }) };
  const memories = {
    recallByKinds: jest
      .fn()
      .mockResolvedValue([
        { id: 'm1', content: '偏好先给结论再给理由', kind: 'preference' },
      ]),
  };
  const agent = new InterviewAgentService(
    models as never,
    retrieval as never,
    memories as never,
  );
  return { agent, models, retrieval, memories };
}

const input = {
  ownerId: 'user_1',
  datasetId: 'dataset_1',
  topic: 'project_deep_dive',
  intensity: 'deep',
  hits: [],
};

describe('InterviewAgentService', () => {
  it('injects preference and goal memories into the question prompt', async () => {
    const { agent, models, memories } = buildAgent();

    await agent.generateQuestion(input);

    // 只取偏好与目标：事实类记忆与出题无关，还会把题带偏
    expect(memories.recallByKinds).toHaveBeenCalledWith('user_1', [
      'preference',
      'goal',
    ]);
    expect(models.generateQuestion).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'project_deep_dive',
        intensity: 'deep',
        memories: [
          { id: 'm1', content: '偏好先给结论再给理由', kind: 'preference' },
        ],
      }),
    );
  });

  it('builds the retrieval query from the focus text when provided', async () => {
    const { agent, retrieval } = buildAgent();

    await agent.generateQuestion({
      ...input,
      focus: '基于简历里的支付网关项目',
    });

    expect(retrieval.hybrid).toHaveBeenCalledWith(
      expect.objectContaining({ query: '基于简历里的支付网关项目' }),
    );
  });

  it('falls back to the topic preset query without a focus', async () => {
    const { agent, retrieval } = buildAgent();

    await agent.generateQuestion(input);

    expect(retrieval.hybrid).toHaveBeenCalledWith(
      expect.objectContaining({ query: '项目技术架构 核心难点 设计取舍' }),
    );
  });

  it('still produces a question when memory is unavailable', async () => {
    const { agent, models, memories } = buildAgent();
    memories.recallByKinds.mockRejectedValue(new Error('数据库不可用'));

    await expect(agent.generateQuestion(input)).resolves.toEqual({
      question: '请介绍项目中的缓存设计。',
    });
    expect(models.generateQuestion).toHaveBeenCalledWith(
      expect.objectContaining({ memories: [] }),
    );
  });

  it('skips the memory lookup when no owner is provided', async () => {
    const { agent, memories } = buildAgent();

    await agent.generateQuestion({
      topic: 'project_deep_dive',
      intensity: 'deep',
      hits: [],
    });

    expect(memories.recallByKinds).not.toHaveBeenCalled();
  });
});
