import { listDatasets } from '../../services/datasets';
import {
  createConversation,
  isMetaEvent,
  listMessages,
  streamMessage,
} from '../../services/chat';
import { ChatCitation, ChatMessage } from '../../types/chat';
import { Dataset } from '../../types/api';
import { ensureAuthenticated } from '../../utils/auth-guard';
import { showRequestError } from '../../utils/feedback';

interface DisplayMessage extends ChatMessage {
  streaming?: boolean;
}

Page({
  data: {
    datasets: [] as Dataset[],
    selectedDatasetIds: [] as string[],
    messages: [] as DisplayMessage[],
    input: '',
    conversationId: '',
    loading: true,
    sending: false,
    error: '',
    scrollTo: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    if (!ensureAuthenticated()) return;
    if (query.datasetId) {
      this.setData({ selectedDatasetIds: [query.datasetId] });
    }
    void this.initialize();
  },

  async initialize() {
    this.setData({ loading: true, error: '' });
    try {
      const datasets = (await listDatasets()).items;
      const selectedDatasetIds =
        this.data.selectedDatasetIds.length > 0
          ? this.data.selectedDatasetIds
          : datasets[0]
            ? [datasets[0].id]
            : [];
      this.setData({ datasets, selectedDatasetIds });
      await this.createNewConversation();
    } catch (error) {
      this.setData({ error: '无法初始化问答会话' });
      showRequestError(error);
    } finally {
      this.setData({ loading: false });
    }
  },

  async createNewConversation() {
    const conversation = await createConversation({
      title: '资料问答',
      datasetIds: this.data.selectedDatasetIds,
    });
    this.setData({ conversationId: conversation.id, messages: [] });
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
      const userMessage: DisplayMessage = {
        id: `local-user-${Date.now()}`,
        role: 'user',
        content,
        usedTools: [],
        thinking: false,
        citations: [],
      };
      const assistantMessage: DisplayMessage = {
        id: `local-assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        usedTools: [],
        thinking: false,
        citations: [],
        streaming: true,
      };
      this.setData({
        messages: [...this.data.messages, userMessage, assistantMessage],
        input: '',
        sending: true,
      });
      this.scrollToBottom();

      await streamMessage(this.data.conversationId, content, (event) => {
        this.handleStreamEvent(assistantMessage.id, event.event, event.data);
      });
      const history = await listMessages(this.data.conversationId);
      this.setData({ messages: history.items });
      this.scrollToBottom();
    } catch (error) {
      showRequestError(error);
    } finally {
      this.setData({ sending: false });
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
      target.id = data.messageId;
      target.usedTools = data.usedTools;
      target.model = data.model ?? null;
      target.thinking = data.thinking;
    }
    if (event === 'token' && typeof data.text === 'string') {
      target.content += data.text;
    }
    if (event === 'citation') {
      target.citations.push(data as unknown as ChatCitation);
    }
    if (event === 'done') {
      target.streaming = false;
      target.confidence =
        typeof data.confidence === 'number' ? data.confidence : null;
    }
    if (event === 'error') {
      target.streaming = false;
      target.content =
        typeof data.message === 'string' ? data.message : '问答失败';
    }
    this.setData({ messages });
    this.scrollToBottom();
  },

  newConversation() {
    void this.createNewConversation();
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
