import { jsonObjectChat } from './ark.js';
import { loadPrompt } from './prompts.js';
import { buildBubble } from './bubble-factory.js';
import { newId } from '../utils/ids.js';
import { summarySchema } from '../utils/schemas.js';

/* 融合 base 与 targets，生成 origin=fusion 的新 bubble，同事务落库并可追溯 */
export async function fuseBubble(base, targetIds, repo) {
  const targets = await Promise.all(targetIds.map((id) => repo.getBubble(id)));
  if (targets.some((t) => !t)) {
    const err = new Error('部分目标灵感不存在');
    err.code = 'FUSE_TARGET_NOT_FOUND';
    err.status = 404;
    throw err;
  }

  const system = await loadPrompt('fuse');
  const items = [base, ...targets];
  const userText = items
    .map(
      (b, i) =>
        `灵感${i + 1}：\n标题：${b.title}\n标签：${b.tags.join('、')}\n正文：${b.content}`
    )
    .join('\n\n');

  const summary = await jsonObjectChat({
    schema: summarySchema,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: userText },
    ],
  });

  const resultBubble = await buildBubble(repo, {
    summary,
    source: '融合生成，无独立转写',
    origin: 'fusion',
  });

  const participantIds = [base.id, ...targetIds];
  await repo.saveFusion({
    fusionId: newId('fu'),
    resultBubble,
    participantIds,
  });
  return resultBubble;
}
