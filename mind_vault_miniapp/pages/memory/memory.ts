import { ensureAuthenticated } from '../../utils/auth-guard';
import { showRequestError } from '../../utils/feedback';
import { formatMemoryTime, memoryKindLabel } from '../../utils/memory';
import {
  getRequestTraces,
  StreamUsageSummary,
  summarizeStreamUsage,
} from '../../utils/telemetry';
import {
  clearMemories,
  createMemory,
  deleteMemory,
  listMemories,
  updateMemory,
} from '../../services/memories';
import { MemoryItem, MemoryKind, MemoryStatus } from '../../types/memory';
import { RequestTrace } from '../../types/telemetry';

const MAX_CONTENT = 200;
/** 与后端 memoryConfig.maxActivePerUser 保持一致，用于提前提示容量 */
const MAX_ACTIVE_MEMORIES = 200;

const KIND_OPTIONS: { value: MemoryKind; label: string }[] = [
  { value: 'preference', label: '偏好' },
  { value: 'fact', label: '关于我' },
  { value: 'goal', label: '目标' },
];

type MemoryListItem = MemoryItem & {
  kindLabel: string;
  timeLabel: string;
};

type UsageView = StreamUsageSummary & {
  memoryRateText: string;
  generalRateText: string;
};

Page({
  data: {
    status: 'ACTIVE' as MemoryStatus,
    memories: [] as MemoryListItem[],
    counts: { active: 0, superseded: 0 },
    maxActive: MAX_ACTIVE_MEMORIES,
    atCapacity: false,
    usage: {
      total: 0,
      memoryInjected: 0,
      generalAnswers: 0,
      memoryRateText: '0%',
      generalRateText: '0%',
    } as UsageView,
    loading: true,
    error: '',
    showEditor: false,
    editingId: '',
    draftContent: '',
    draftKind: 'fact' as MemoryKind,
    kindOptions: KIND_OPTIONS,
    saving: false,
    clearing: false,
  },

  onShow() {
    if (!ensureAuthenticated()) return;
    void this.loadMemories();
  },

  async loadMemories() {
    this.setData({ loading: true, error: '' });
    try {
      // 两个状态都要取：条数就是"抽取噪声"的指标，已失效多了说明取代判定偏激进
      const [active, superseded] = await Promise.all([
        listMemories('ACTIVE'),
        listMemories('SUPERSEDED'),
      ]);
      const current = this.data.status === 'ACTIVE' ? active : superseded;
      this.setData({
        memories: current.items.map(withDisplayFields),
        counts: {
          active: active.items.length,
          superseded: superseded.items.length,
        },
        // 满仓后新抽取的记忆会挤掉最冷门的旧条目，这里提前把治理入口露出来
        atCapacity: active.items.length >= MAX_ACTIVE_MEMORIES,
        usage: withUsageSummary(getRequestTraces()),
      });
    } catch (error) {
      this.setData({ error: '无法加载长期记忆' });
      showRequestError(error);
    } finally {
      this.setData({ loading: false });
    }
  },

  switchStatus(event: WechatMiniprogram.BaseEvent) {
    const status = event.currentTarget.dataset.status as MemoryStatus;
    if (!status || status === this.data.status) return;
    this.setData({ status, memories: [], error: '' });
    void this.loadMemories();
  },

  openCreate() {
    this.setData({
      showEditor: true,
      editingId: '',
      draftContent: '',
      draftKind: 'fact',
    });
  },

  openEdit(event: WechatMiniprogram.BaseEvent) {
    const id = event.currentTarget.dataset.id as string;
    const memory = this.data.memories.find((item) => item.id === id);
    if (!memory) return;
    this.setData({
      showEditor: true,
      editingId: id,
      draftContent: memory.content,
      draftKind: memory.kind,
    });
  },

  closeEditor() {
    this.setData({ showEditor: false });
  },

  updateContent(event: WechatMiniprogram.CustomEvent) {
    this.setData({ draftContent: inputValue(event.detail) });
  },

  selectKind(event: WechatMiniprogram.BaseEvent) {
    const kind = event.currentTarget.dataset.kind as MemoryKind;
    if (!kind || kind === this.data.draftKind) return;
    this.setData({ draftKind: kind });
  },

  async saveMemory() {
    const content = this.data.draftContent.trim();
    if (!content) {
      wx.showToast({ title: '请输入记忆内容', icon: 'none' });
      return;
    }
    if (content.length > MAX_CONTENT) {
      wx.showToast({ title: `记忆内容最多 ${MAX_CONTENT} 字`, icon: 'none' });
      return;
    }
    const editingId = this.data.editingId;
    this.setData({ saving: true });
    try {
      if (editingId) {
        await updateMemory(editingId, { content, kind: this.data.draftKind });
      } else {
        await createMemory({ content, kind: this.data.draftKind });
      }
      this.setData({ showEditor: false });
      await this.loadMemories();
      wx.showToast({ title: editingId ? '已更新' : '已记住', icon: 'success' });
    } catch (error) {
      showRequestError(error);
    } finally {
      this.setData({ saving: false });
    }
  },

  removeMemory(event: WechatMiniprogram.BaseEvent) {
    const id = event.currentTarget.dataset.id as string;
    if (!id) return;
    wx.showModal({
      title: '删除这条记忆？',
      content: '删除后不会再被参考，也无法恢复。',
      confirmText: '删除',
      confirmColor: '#c65353',
      success: (result) => {
        if (result.confirm) void this.confirmRemove(id);
      },
    });
  },

  async confirmRemove(id: string) {
    try {
      await deleteMemory(id);
      await this.loadMemories();
      wx.showToast({ title: '已删除', icon: 'success' });
    } catch (error) {
      showRequestError(error);
    }
  },

  restoreMemory(event: WechatMiniprogram.BaseEvent) {
    const id = event.currentTarget.dataset.id as string;
    if (!id) return;
    void this.confirmRestore(id);
  },

  async confirmRestore(id: string) {
    try {
      await updateMemory(id, { status: 'ACTIVE' });
      await this.loadMemories();
      wx.showToast({ title: '已恢复', icon: 'success' });
    } catch (error) {
      showRequestError(error);
    }
  },

  clearAll() {
    wx.showModal({
      title: '清空全部记忆？',
      content: '包括已失效的历史条目，清空后无法恢复。',
      confirmText: '清空',
      confirmColor: '#c65353',
      success: (result) => {
        if (result.confirm) void this.confirmClear();
      },
    });
  },

  async confirmClear() {
    this.setData({ clearing: true });
    try {
      const result = await clearMemories();
      await this.loadMemories();
      wx.showToast({ title: `已清空 ${result.deleted} 条`, icon: 'none' });
    } catch (error) {
      showRequestError(error);
    } finally {
      this.setData({ clearing: false });
    }
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

function withDisplayFields(memory: MemoryItem): MemoryListItem {
  return {
    ...memory,
    kindLabel: memoryKindLabel(memory.kind),
    timeLabel: formatMemoryTime(memory.lastUsedAt),
  };
}

function withUsageSummary(traces: RequestTrace[]): UsageView {
  const summary = summarizeStreamUsage(traces);
  return {
    ...summary,
    memoryRateText: rateText(summary.memoryInjected, summary.total),
    generalRateText: rateText(summary.generalAnswers, summary.total),
  };
}

function rateText(count: number, total: number): string {
  if (total === 0) return '0%';
  return `${Math.round((count / total) * 100)}%`;
}
