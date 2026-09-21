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
  mode: 'project_deep_dive',
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
        memories: [
          { id: 'm1', content: '偏好先给结论再给理由', kind: 'preference' },
        ],
      }),
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

    await agent.generateQuestion({ mode: 'project_deep_dive', hits: [] });

    expect(memories.recallByKinds).not.toHaveBeenCalled();
  });
});
