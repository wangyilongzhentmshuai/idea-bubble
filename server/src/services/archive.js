import { jsonObjectChat } from './ark.js';
import { loadPrompt } from './prompts.js';
import { newId } from '../utils/ids.js';
import { classifyWithJarSchema } from '../utils/schemas.js';

/* 一次结构化调用：同时完成主题分类与近义罐判断 */
async function classifyWithJar(bubble, existingJars) {
  const system = await loadPrompt('classify');
  const jarList = existingJars.length
    ? existingJars.map((j, i) => `${i + 1}. ${j.theme}`).join('\n')
    : '（当前没有任何主题罐）';
  return jsonObjectChat({
    schema: classifyWithJarSchema,
    messages: [
      { role: 'system', content: system },
      {
        role: 'user',
        content:
          `标题：${bubble.title}\n标签：${bubble.tags.join('、')}\n正文：${bubble.content}\n\n` +
          `现有主题罐：\n${jarList}`,
      },
    ],
  });
}

/* 完整归档编排：一次调用分类归一 → 建罐/并罐 → 落库 */
export async function archiveBubble(bubble, repo) {
  const existingJars = await repo.listJars();
  const classified = await classifyWithJar(bubble, existingJars);

  const idx = classified.matchedIndex;
  const matched =
    idx != null && idx >= 1 && idx <= existingJars.length
      ? existingJars[idx - 1]
      : null;

  let jar;
  let isNewJar = false;
  if (matched) {
    jar = matched;
  } else {
    isNewJar = true;
    jar = await repo.addJar({
      id: newId('j'),
      theme: classified.theme,
      themeColor: classified.color,
      createdAt: new Date().toISOString(),
    });
  }

  await repo.archiveBubbleToJar(bubble.id, jar.id);
  return { theme: jar.theme, jarId: jar.id, isNewJar };
}
