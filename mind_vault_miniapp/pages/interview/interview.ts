import { ensureAuthenticated } from '../../utils/auth-guard';
import { listDatasets } from '../../services/datasets';
import {
  finishInterviewSession,
  getInterviewSession,
  streamInterviewAnswer,
  streamInterviewSession,
} from '../../services/interview';
import { Dataset } from '../../types/api';
import {
  InterviewEvaluation,
  InterviewIntensity,
  InterviewSession,
  InterviewTopic,
} from '../../types/interview';
import { showRequestError } from '../../utils/feedback';
import { consumePendingInterviewSessionId } from '../../utils/interview-navigation';

const PREPARING_LABEL = '正在准备…';
/** 后端阶段事件到文案的映射，缺字段就沿用上一条，避免界面退回空白 */
const STAGE_LABELS: Record<string, string> = {
  preparing: PREPARING_LABEL,
  retrieving: '正在检索你的资料…',
  evaluating: '正在评估你的回答…',
  generating: '正在生成题目…',
};

let pendingSessionId = '';
let waitingTimer: ReturnType<typeof setInterval> | null = null;

function clearWaitingTimer() {
  if (waitingTimer === null) return;
  clearInterval(waitingTimer);
  waitingTimer = null;
}

Page({
  data: {
    datasets: [] as Dataset[],
    selectedDatasetId: '',
    topic: 'project_deep_dive' as InterviewTopic,
    intensity: 'deep' as InterviewIntensity,
    focus: '',
    jobDescription: '',
    showJobDescription: false,
    totalQuestions: 5,
    session: null as InterviewSession | null,
    answer: '',
    evaluation: null as InterviewEvaluation | null,
    loading: true,
    creating: false,
    submitting: false,
    waitingLabel: '',
    waitingSeconds: 0,
    error: '',
  },

  onLoad(query: Record<string, string | undefined>) {
    pendingSessionId = query.sessionId ?? '';
  },

  onShow() {
    if (!ensureAuthenticated()) return;
    const storedSessionId = consumePendingInterviewSessionId();
    if (storedSessionId) pendingSessionId = storedSessionId;
    void this.loadDatasets();
  },

  onUnload() {
    clearWaitingTimer();
  },

  /** 检索与模型生成通常要十秒以上，用阶段文案加计时避免界面像卡死 */
  beginWait(label: string) {
    clearWaitingTimer();
    this.setData({ waitingLabel: label, waitingSeconds: 0 });
    waitingTimer = setInterval(() => {
      this.setData({ waitingSeconds: this.data.waitingSeconds + 1 });
    }, 1000);
  },

  endWait() {
    clearWaitingTimer();
    this.setData({ waitingLabel: '', waitingSeconds: 0 });
  },

  /** 阶段到达时只换文案，计时器继续跑；等待结束后忽略迟到的阶段 */
  updateStage(stage: string) {
    const label = STAGE_LABELS[stage];
    if (label && this.data.waitingLabel) {
      this.setData({ waitingLabel: label });
    }
  },

  async loadDatasets() {
    this.setData({ loading: true, error: '' });
    try {
      const datasets = (await listDatasets()).items;
      this.setData({
        datasets,
        selectedDatasetId: this.data.selectedDatasetId || datasets[0]?.id || '',
      });
      if (pendingSessionId) {
        const session = await getInterviewSession(pendingSessionId);
        pendingSessionId = '';
        this.setData({
          session,
          selectedDatasetId: session.datasetId,
        });
      }
    } catch (error) {
      this.setData({ error: '无法加载训练资料' });
      showRequestError(error);
    } finally {
      this.setData({ loading: false });
    }
  },

  openReviews() {
    wx.navigateTo({ url: '/pages/review/review' });
  },

  selectDataset(event: WechatMiniprogram.BaseEvent) {
    const id = event.currentTarget.dataset.id as string;
    if (id) this.setData({ selectedDatasetId: id });
  },

  selectTopic(event: WechatMiniprogram.BaseEvent) {
    const topic = event.currentTarget.dataset.topic as InterviewTopic;
    if (topic) this.setData({ topic });
  },

  selectIntensity(event: WechatMiniprogram.BaseEvent) {
    const intensity = event.currentTarget.dataset
      .intensity as InterviewIntensity;
    if (intensity) this.setData({ intensity });
  },

  updateFocus(event: WechatMiniprogram.CustomEvent) {
    this.setData({ focus: inputValue(event.detail) });
  },

  updateJobDescription(event: WechatMiniprogram.CustomEvent) {
    this.setData({ jobDescription: inputValue(event.detail) });
  },

  openJobDescription() {
    this.setData({ showJobDescription: true });
  },

  closeJobDescription() {
    this.setData({ showJobDescription: false });
  },

  updateAnswer(event: WechatMiniprogram.CustomEvent) {
    this.setData({ answer: inputValue(event.detail) });
  },

  async startSession() {
    if (!this.data.selectedDatasetId) {
      wx.showToast({ title: '请先选择资料集', icon: 'none' });
      return;
    }
    this.setData({ creating: true, evaluation: null, answer: '' });
    this.beginWait(PREPARING_LABEL);
    try {
      const focus = this.data.focus.trim();
      const jobDescription = this.data.jobDescription.trim();
      const session = await streamInterviewSession(
        {
          datasetId: this.data.selectedDatasetId,
          topic: this.data.topic,
          intensity: this.data.intensity,
          focus: focus || undefined,
          jobDescription: jobDescription || undefined,
          totalQuestions: this.data.totalQuestions,
        },
        (stage) => this.updateStage(stage)
      );
      this.setData({ session });
    } catch (error) {
      showRequestError(error);
    } finally {
      this.endWait();
      this.setData({ creating: false });
    }
  },

  async submitAnswer() {
    const session = this.data.session;
    const answer = this.data.answer.trim();
    if (!session || !answer || this.data.submitting) return;
    this.setData({ submitting: true });
    // 最后一题不会再有出题阶段，文案会自然停在「正在评估」上
    this.beginWait(PREPARING_LABEL);
    try {
      const result = await streamInterviewAnswer(session.id, answer, (stage) =>
        this.updateStage(stage)
      );
      const nextSession: InterviewSession = {
        ...session,
        status: result.status,
        currentIndex: session.currentIndex + 1,
        currentQuestion: result.nextQuestion,
      };
      this.setData({
        session: nextSession,
        evaluation: result.evaluation,
        answer: '',
      });
    } catch (error) {
      showRequestError(error);
    } finally {
      this.endWait();
      this.setData({ submitting: false });
    }
  },

  async finishSession() {
    const session = this.data.session;
    if (!session) return;
    try {
      const completed = await finishInterviewSession(session.id);
      this.setData({ session: completed });
    } catch (error) {
      showRequestError(error);
    }
  },

  resetSession() {
    this.setData({
      session: null,
      answer: '',
      evaluation: null,
    });
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
