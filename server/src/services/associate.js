import { jsonObjectChat } from './ark.js';
import { loadPrompt } from './prompts.js';
import { newId } from '../utils/ids.js';
import { deterministicScores } from '../utils/scoring.js';
import { semanticScoreSchema } from '../utils/schemas.js';

async function semanticPair(base, target, system) {
  return jsonObjectChat({
    schema: semanticScoreSchema,
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content:
          `灵感A：\n标题：${base.title}\n正文：${base.content}\n\n` +
          `灵感B：\n标题：${target.title}\n正文：${target.content}`,
      },
    ],
  });
}

/* 语义分调大模型，标签/主题/关键词后端计算，后端求和并按阈值过滤 */
export async function associateBubble(base, repo, threshold) {
  const all = await repo.listBubbles();
  const targets = all.filter((b) => b.id !== base.id);
  const system = await loadPrompt('associate');
  const now = new Date().toISOString();

  const settled = await Promise.allSettled(
    targets.map((t) => semanticPair(base, t, system))
  );

  const candidates = [];
  targets.forEach((target, i) => {
    if (settled[i].status !== 'fulfilled') return;
    const semantic = settled[i].value;
    const d = deterministicScores(base, target);
    const total = semantic.semantic + d.tag + d.topic + d.keyword;
    const passed = total >= threshold;

    repo.saveAssociationScore({
      id: newId('as'),
      baseBubbleId: base.id,
      targetBubbleId: target.id,
      semantic: semantic.semantic,
      tag: d.tag,
      topic: d.topic,
      keyword: d.keyword,
      total,
      passed,
      reason: semantic.reason,
      createdAt: now,
    });

    if (passed) {
      candidates.push({
        targetId: target.id,
        targetTitle: target.title,
        total,
        dimScores: {
          semantic: semantic.semantic,
          tag: d.tag,
          topic: d.topic,
          keyword: d.keyword,
        },
        reason: semantic.reason,
      });
    }
  });

  candidates.sort((a, b) => b.total - a.total);
  return candidates.slice(0, 2);
}
