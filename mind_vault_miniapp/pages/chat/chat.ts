import { listDatasets } from '../../services/datasets';
import {
  createConversation,
  isMetaEvent,
  listConversations,
  listMessages,
  streamMessage,
  StreamHandle,
  updateConversationDatasetScope,
} from '../../services/chat';
import {
  ChatCitation,
  ChatMessage,
  Conversation,
  DatasetChoice,
} from '../../types/chat';
import { Dataset } from '../../types/api';
import { ensureAuthenticated } from '../../utils/auth-guard';
import { showRequestError } from '../../utils/feedback';
import { markdownToHtml } from '../../utils/markdown-render';
import { sanitizeMarkdown } from '../../utils/markdown-safety';
import {
  datasetScopeSummary,
  isAllDatasetScope,
  markDatasetChoices,
  normalizeDatasetScope,
  sanitizeDatasetScope,
  toggleAllDatasetScope,
  toggleDatasetScope,
} from '../../utils/chat-dataset-scope';

interface DisplayMessage extends ChatMessage {
  streaming?: boolean;
  rendered?: boolean;
  markdownContent?: string;
  stage?: string;
  toolLabels?: string[];
  /** 本轮是否注入了长期记忆，用于气泡下方提示，不展示原始 memory 工具名 */
  usedMemory?: boolean;
}

const MEMORY_TOOL = 'memory';
let activeStream: StreamHandle | null = null;
let datasetSearchTimer: ReturnType<typeof setTimeout> | null = null;
const STAGE_LABELS: Record<string, string> = {
  preparing: '正在准备回答',
  rewrite: '正在理解上下文',
  recall: '正在检索你的记忆',
  classify: '正在分析问题',
  gate: '正在确认资料相关性',
  retrieve: '正在检索资料',
  answer: '正在生成回答',
};
const TOOL_LABELS: Record<string, string> = {
  vector: '语义检索',
  keyword: '关键词检索',
  graph: '知识图谱',
};

/**
 * 把记忆工具名从展示列表里摘出来单独标记：
 * 后端 meta 只给工具名数组，气泡上直接显示 "memory" 对用户没有意义。
 */
function splitMemoryTool(usedTools: string[]): {
  tools: string[];
  usedMemory: boolean;
} {
  return {
    tools: usedTools.filter((tool) => tool !== MEMORY_TOOL),
    usedMemory: usedTools.includes(MEMORY_TOOL),
  };
}

function withMemoryFlag(message: ChatMessage): DisplayMessage {
  const { tools, usedMemory } = splitMemoryTool(message.usedTools);
  return {
    ...message,
    usedTools: tools,
    usedMemory,
    rendered: message.role === 'assistant',
    markdownContent:
      message.role === 'assistant'
        ? markdownToHtml(sanitizeMarkdown(message.content))
        : undefined,
    stage:
      message.status === 'ABORTED'
        ? '已停止生成'
        : message.status === 'FAILED'
          ? '生成失败'
          : undefined,
    toolLabels: tools.map((tool) => TOOL_LABELS[tool] ?? tool),
  };
}

Page({
  data: {
    datasets: [] as Dataset[],
    selectedDatasetIds: [] as string[],
    datasetScopeLabel: '全部资料',
    draftDatasetIds: [] as string[],
    isAllScope: false,
    showDatasetSelector: false,
    datasetQuery: '',
    datasetResults: [] as DatasetChoice[],
    searchingDatasets: false,
    datasetFeedback: '',
    savingDatasetScope: false,
    datasetScopeError: '',
    messages: [] as DisplayMessage[],
    input: '',
    conversationId: '',
    conversations: [] as Conversation[],
    currentConversationTitle: '资料问答',
    showConversationPicker: false,
    loading: true,
    sending: false,
    stopping: false,
    error: '',
    scrollTo: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    if (!ensureAuthenticated()) return;
    if (query.datasetId) {
      this.setData({ selectedDatasetIds: [query.datasetId] });
    }
    void this.initialize(query);
  },

  async initialize(query: Record<string, string | undefined> = {}) {
    this.setData({ loading: true, error: '' });
    try {
      const [datasetsResponse, conversationsResponse] = await Promise.all([
        listDatasets(),
        listConversations(),
      ]);
      const datasets = datasetsResponse.items;
      const conversations = conversationsResponse.items;
      this.setData({
        datasets,
        conversations,
        selectedDatasetIds: datasets.map((dataset) => dataset.id),
        datasetScopeLabel: '全部资料',
      });
      const requestedConversation = conversations.find(
        (conversation) => conversation.id === query.conversationId
      );
      if (requestedConversation) {
        await this.openConversation(requestedConversation);
      } else if (query.new === '1' || conversations.length === 0) {
        await this.createNewConversation(datasets.map((dataset) => dataset.id));
      } else {
        await this.openConversation(conversations[0]);
      }
      const sendKey = query.sendKey;
      const pendingQuestion =
        sendKey && typeof wx.getStorageSync(sendKey) === 'string'
          ? (wx.getStorageSync(sendKey) as string)
          : '';
      if (sendKey) wx.removeStorageSync(sendKey);
      if (pendingQuestion) {
        this.setData({ input: pendingQuestion });
        await this.sendMessage();
      }
    } catch (error) {
      this.setData({ error: '无法初始化问答会话' });
      showRequestError(error);
    } finally {
      this.setData({ loading: false });
    }
  },

  async createNewConversation(datasetIds?: string[]) {
    const nextDatasetIds =
      datasetIds ?? this.data.datasets.map((dataset) => dataset.id);
    const conversation = await createConversation({
      title: '资料问答',
      datasetIds: nextDatasetIds,
    });
    this.setData({
      conversationId: conversation.id,
      currentConversationTitle: conversation.title,
      selectedDatasetIds: conversation.datasetIds,
      datasetScopeLabel: datasetScopeSummary(
        conversation.datasetIds,
        this.data.datasets
      ),
      conversations: [conversation, ...this.data.conversations],
      messages: [],
    });
  },

  async openConversation(conversation: Conversation) {
    const history = await listMessages(conversation.id);
    const selectedDatasetIds = normalizeDatasetScope(
      conversation.datasetIds,
      this.data.datasets.map((dataset) => dataset.id)
    );
    this.setData({
      conversationId: conversation.id,
      currentConversationTitle: conversation.title,
      selectedDatasetIds,
      datasetScopeLabel: datasetScopeSummary(
        selectedDatasetIds,
        this.data.datasets
      ),
      messages: history.items.map(withMemoryFlag),
    });
  },

  openDatasetSelector() {
    if (this.data.sending || this.data.savingDatasetScope) return;
    const draftDatasetIds = normalizeDatasetScope(
      this.data.selectedDatasetIds,
      this.data.datasets.map((dataset) => dataset.id)
    );
    this.setData({
      draftDatasetIds,
      isAllScope: isAllDatasetScope(
        draftDatasetIds,
        this.data.datasets.map((dataset) => dataset.id)
      ),
      showDatasetSelector: true,
      datasetQuery: '',
      datasetResults: markDatasetChoices(
        this.data.datasets.slice(0, 6),
        draftDatasetIds
      ),
      datasetFeedback: '',
      datasetScopeError: '',
    });
  },

  closeDatasetSelector() {
    if (this.data.savingDatasetScope) return;
    if (datasetSearchTimer) clearTimeout(datasetSearchTimer);
    datasetSearchTimer = null;
    this.setData({
      showDatasetSelector: false,
      draftDatasetIds: [],
      datasetQuery: '',
      datasetResults: [],
      searchingDatasets: false,
      datasetFeedback: '',
      datasetScopeError: '',
    });
  },

  updateDatasetQuery(event: WechatMiniprogram.CustomEvent) {
    const datasetQuery = inputValue(event.detail);
    this.setData({
      datasetQuery,
      searchingDatasets: true,
      datasetFeedback: '正在搜索',
      datasetScopeError: '',
    });
    if (datasetSearchTimer) clearTimeout(datasetSearchTimer);
    datasetSearchTimer = setTimeout(() => {
      datasetSearchTimer = null;
      void listDatasets({ name: datasetQuery, pageSize: 20 })
        .then((response) => {
          this.setData({
            datasetResults: markDatasetChoices(
              response.items,
              this.data.draftDatasetIds
            ),
            searchingDatasets: false,
            datasetFeedback: response.items.length ? '' : '没有匹配的资料集',
          });
        })
        .catch((error) => {
          this.setData({
            searchingDatasets: false,
            datasetFeedback: '搜索失败，请重试',
            datasetScopeError:
              error instanceof Error ? error.message : '搜索资料集失败',
          });
          showRequestError(error);
        });
    }, 240);
  },

  toggleAllDatasets() {
    const allIds = this.data.datasets.map((dataset) => dataset.id);
    const draftDatasetIds = toggleAllDatasetScope(
      this.data.draftDatasetIds,
      allIds
    );
    this.setData({
      draftDatasetIds,
      datasetResults: markDatasetChoices(
        this.data.datasetResults,
        draftDatasetIds
      ),
      isAllScope: isAllDatasetScope(draftDatasetIds, allIds),
    });
  },

  toggleDraftDataset(event: WechatMiniprogram.BaseEvent) {
    const id = event.currentTarget.dataset.id as string;
    const allIds = this.data.datasets.map((dataset) => dataset.id);
    const draftDatasetIds = toggleDatasetScope(this.data.draftDatasetIds, id);
    this.setData({
      draftDatasetIds,
      datasetResults: markDatasetChoices(
        this.data.datasetResults,
        draftDatasetIds
      ),
      isAllScope: isAllDatasetScope(draftDatasetIds, allIds),
    });
  },

  async saveDatasetScope() {
    const datasetIds = sanitizeDatasetScope(
      this.data.draftDatasetIds,
      this.data.datasets.map((dataset) => dataset.id)
    );
    if (!datasetIds.length) {
      wx.showToast({ title: '请至少选择一个资料集', icon: 'none' });
      return;
    }
    this.setData({ savingDatasetScope: true, datasetScopeError: '' });
    try {
      const conversation = await updateConversationDatasetScope(
        this.data.conversationId,
        datasetIds
      );
      this.setData({
        selectedDatasetIds: conversation.datasetIds,
        datasetScopeLabel: datasetScopeSummary(
          conversation.datasetIds,
          this.data.datasets
        ),
        conversations: this.data.conversations.map((item) =>
          item.id === conversation.id ? conversation : item
        ),
        showDatasetSelector: false,
        draftDatasetIds: [],
        datasetResults: [],
        datasetFeedback: '',
        isAllScope: isAllDatasetScope(
          conversation.datasetIds,
          this.data.datasets.map((dataset) => dataset.id)
        ),
      });
    } catch (error) {
      this.setData({
        datasetScopeError:
          error instanceof Error ? error.message : '保存资料范围失败',
      });
      showRequestError(error);
    } finally {
      this.setData({ savingDatasetScope: false });
    }
  },

  updateInput(event: WechatMiniprogram.CustomEvent) {
    this.setData({ input: inputValue(event.detail) });
  },

  async sendMessage() {
    const content = this.data.input.trim();
    if (!content || this.data.sending) return;
    if (this.data.savingDatasetScope) {
      wx.showToast({ title: '正在保存资料范围', icon: 'none' });
      return;
    }
    if (this.data.selectedDatasetIds.length === 0) {
      wx.showToast({ title: '请至少选择一个资料集', icon: 'none' });
      return;
    }
    try {
      if (!this.data.conversationId) {
        await this.createNewConversation();
      }
      const conversationId = this.data.conversationId;
      const userMessage: DisplayMessage = {
        id: `local-user-${Date.now()}`,
        role: 'user',
        content,
        usedTools: [],
        toolLabels: [],
        thinking: false,
        citations: [],
      };
      const assistantMessage: DisplayMessage = {
        id: `local-assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        usedTools: [],
        toolLabels: [],
        thinking: false,
        citations: [],
        streaming: true,
      };
      this.setData({
        messages: [...this.data.messages, userMessage, assistantMessage],
        input: '',
        sending: true,
        stopping: false,
      });
      this.scrollToBottom();

      let streamFailed = false;
      const stream = streamMessage(conversationId, content, (event) => {
        if (event.event === 'error') streamFailed = true;
        this.handleStreamEvent(assistantMessage.id, event.event, event.data);
      });
      activeStream = stream;
      await stream.promise;
      if (activeStream !== stream) return;
      activeStream = null;
      if (stream.isAborted()) return;
      if (streamFailed) {
        // 失败时后端没有落库助手消息，用服务端历史覆盖会抹掉刚渲染的错误提示
        this.scrollToBottom();
        return;
      }
      const history = await listMessages(conversationId);
      if (this.data.conversationId !== conversationId) return;
      this.setData({ messages: history.items.map(withMemoryFlag) });
      this.scrollToBottom();
    } catch (error) {
      showRequestError(error);
    } finally {
      this.setData({ sending: false, stopping: false });
    }
  },

  handleStreamEvent(
    localMessageId: string,
    event: string,
    data: Record<string, unknown>
  ) {
    const messages = this.data.messages.map((message) => ({ ...message }));
    const target = messages.find((message) => message.id === localMessageId);
    if (!target) return;
    if (event === 'meta' && isMetaEvent(data)) {
      const { tools, usedMemory } = splitMemoryTool(data.usedTools);
      target.id = data.messageId;
      target.usedTools = tools;
      target.usedMemory = usedMemory;
      target.toolLabels = tools.map((tool) => TOOL_LABELS[tool] ?? tool);
      target.model = data.model ?? null;
      target.thinking = data.thinking;
      target.answerMode = data.answerMode;
      target.memoryAction = data.memoryAction;
    }
    if (event === 'token' && typeof data.text === 'string') {
      target.content += data.text;
    }
    if (event === 'stage' && typeof data.stage === 'string') {
      if (!this.data.stopping) {
        target.stage = STAGE_LABELS[data.stage] ?? '正在处理';
      }
    }
    if (event === 'citation') {
      target.citations.push(data as unknown as ChatCitation);
    }
    if (event === 'done') {
      target.streaming = false;
      target.rendered = true;
      target.markdownContent = markdownToHtml(sanitizeMarkdown(target.content));
      target.confidence =
        typeof data.confidence === 'number' ? data.confidence : null;
    }
    if (event === 'error') {
      target.streaming = false;
      target.stage = '生成失败';
      if (!target.content) {
        target.content =
          typeof data.message === 'string' ? data.message : '问答失败';
      }
      target.rendered = Boolean(target.content);
      target.markdownContent = target.rendered
        ? markdownToHtml(sanitizeMarkdown(target.content))
        : undefined;
    }
    this.setData({ messages });
    this.scrollToBottom();
  },

  newConversation() {
    activeStream?.abort();
    activeStream = null;
    this.closeDatasetSelector();
    void this.createNewConversation(
      this.data.datasets.map((dataset) => dataset.id)
    );
  },

  toggleConversationPicker() {
    if (this.data.sending) return;
    this.setData({
      showConversationPicker: !this.data.showConversationPicker,
    });
  },

  async selectConversation(event: WechatMiniprogram.BaseEvent) {
    if (this.data.sending || this.data.savingDatasetScope) return;
    const id = event.currentTarget.dataset.id as string;
    const conversation = this.data.conversations.find((item) => item.id === id);
    if (!conversation || conversation.id === this.data.conversationId) {
      this.setData({ showConversationPicker: false });
      return;
    }
    try {
      this.closeDatasetSelector();
      await this.openConversation(conversation);
      this.setData({ showConversationPicker: false });
      this.scrollToBottom();
    } catch (error) {
      showRequestError(error);
    }
  },

  stopGeneration() {
    if (!activeStream || this.data.stopping) return;
    const messages = this.data.messages.map((message) => ({ ...message }));
    const target = [...messages]
      .reverse()
      .find((message) => message.role === 'assistant' && message.streaming);
    if (target) {
      target.streaming = false;
      target.status = 'ABORTED';
      target.stage = '已停止生成';
    }
    this.setData({ messages, stopping: true });
    activeStream.abort();
  },

  onUnload() {
    activeStream?.abort();
    activeStream = null;
    if (datasetSearchTimer) clearTimeout(datasetSearchTimer);
    datasetSearchTimer = null;
  },

  scrollToBottom() {
    this.setData({ scrollTo: `message-${Date.now()}` });
  },
});

function inputValue(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (
    typeof detail === 'object' &&
    detail !== null &&
    'value' in detail &&
    typeof detail.value === 'string'
  ) {
    return detail.value;
  }
  return '';
}
