import { listDatasets } from '../../services/datasets';
import {
  createConversation,
  isMetaEvent,
  listConversations,
  listMessages,
  streamMessage,
  StreamHandle,
} from '../../services/chat';
import { ChatCitation, ChatMessage, Conversation } from '../../types/chat';
import { Dataset } from '../../types/api';
import { ensureAuthenticated } from '../../utils/auth-guard';
import { showRequestError } from '../../utils/feedback';
import { markdownToHtml } from '../../utils/markdown-render';
import { sanitizeMarkdown } from '../../utils/markdown-safety';

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
    const conversation = await createConversation({
      title: '资料问答',
      datasetIds: datasetIds ?? this.data.selectedDatasetIds,
    });
    this.setData({
      conversationId: conversation.id,
      currentConversationTitle: conversation.title,
      selectedDatasetIds: conversation.datasetIds,
      conversations: [conversation, ...this.data.conversations],
      messages: [],
    });
  },

  async openConversation(conversation: Conversation) {
    const history = await listMessages(conversation.id);
    this.setData({
      conversationId: conversation.id,
      currentConversationTitle: conversation.title,
      selectedDatasetIds: conversation.datasetIds,
      messages: history.items.map(withMemoryFlag),
    });
  },

  toggleDataset(event: WechatMiniprogram.BaseEvent) {
    const id = event.currentTarget.dataset.id as string;
    const selected = this.data.selectedDatasetIds.includes(id);
    const selectedDatasetIds = selected
      ? this.data.selectedDatasetIds.filter((item) => item !== id)
      : [...this.data.selectedDatasetIds, id];
    this.setData({ selectedDatasetIds });
  },

  updateInput(event: WechatMiniprogram.CustomEvent) {
    this.setData({ input: inputValue(event.detail) });
  },

  async sendMessage() {
    const content = this.data.input.trim();
    if (!content || this.data.sending) return;
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
    void this.createNewConversation();
  },

  toggleConversationPicker() {
    if (this.data.sending) return;
    this.setData({
      showConversationPicker: !this.data.showConversationPicker,
    });
  },

  async selectConversation(event: WechatMiniprogram.BaseEvent) {
    if (this.data.sending) return;
    const id = event.currentTarget.dataset.id as string;
    const conversation = this.data.conversations.find((item) => item.id === id);
    if (!conversation || conversation.id === this.data.conversationId) {
      this.setData({ showConversationPicker: false });
      return;
    }
    try {
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
