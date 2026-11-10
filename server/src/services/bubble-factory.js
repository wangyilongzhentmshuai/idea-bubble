import { newId } from '../utils/ids.js';

const BUBBLE_HUES = [
  '#b8a4e8',
  '#8ec9e8',
  '#e8a4c9',
  '#a4e8c9',
  '#e8d28e',
  '#e8a896',
];

const round1 = (n) => Math.round(n * 10) / 10;

/* 标题兜底：模型偶发超长时按码点截断到 16 字，保证落库合规 */
function clampTitle(title) {
  return Array.from(String(title ?? '')).slice(0, 16).join('');
}

/* 统一构建待落库 bubble：x/y/color 由后端分配，保证多端渲染稳定 */
export async function buildBubble(
  repo,
  { summary, source, origin, recordingId = null }
) {
  const now = new Date().toISOString();
  const seq = (await repo.countBubbles()) + 1;
  return {
    id: newId('b'),
    title: clampTitle(summary.title),
    content: summary.content,
    tags: summary.tags,
    status: 'desk',
    source,
    x: round1(4 + Math.random() * 58),
    y: round1(4 + Math.random() * 56),
    color: BUBBLE_HUES[(seq - 1) % BUBBLE_HUES.length],
    jarId: null,
    recordingId,
    origin,
    unclassified: false,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}

/* 构建"整理中"占位泡泡：录音落盘后立即创建，后台完成后再更新内容 */
export async function buildPendingBubble(repo, { recordingId }) {
  const now = new Date().toISOString();
  const seq = (await repo.countBubbles()) + 1;
  return {
    id: newId('b'),
    title: '灵感整理中…',
    content: '语音已收录，AI 正在整理，稍后即可查看',
    tags: [],
    status: 'desk',
    source: null,
    x: round1(4 + Math.random() * 58),
    y: round1(4 + Math.random() * 56),
    color: BUBBLE_HUES[(seq - 1) % BUBBLE_HUES.length],
    jarId: null,
    recordingId,
    origin: 'voice',
    unclassified: false,
    processing: 1,
    schemaVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
}
