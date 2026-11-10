import path from 'node:path';
import { config } from '../config.js';
import { newId } from '../utils/ids.js';
import { transcribe } from './asr.js';
import { jsonObjectChat } from './ark.js';
import { buildPendingBubble } from './bubble-factory.js';
import { loadSummaryPrompt } from './prompts.js';
import { summarySchema } from '../utils/schemas.js';

const clampTitle = (title) => Array.from(String(title ?? '')).slice(0, 16).join('');

/* 快速落库：建 recording + 整理中占位泡泡，不调用方舟 */
export async function createPendingIdea({ repo, file, duration, mime }) {
  const now = new Date().toISOString();
  const recordingId = newId('r');
  const storedAudioPath = path.relative(config.paths.serverRoot, file.path);

  await repo.addRecording({
    id: recordingId,
    audioPath: storedAudioPath,
    duration,
    mime,
    status: 'uploaded',
    createdAt: now,
  });

  const bubble = await buildPendingBubble(repo, { recordingId });
  await repo.addBubbleOnly(bubble);

  return { recordingId, bubble };
}

/* 后台处理：转写 → 总结 → 更新占位泡泡；任一步失败置失败态并保留录音 */
export async function processPendingIdea({
  repo,
  recordingId,
  bubbleId,
  filePath,
  mime,
}) {
  let transcript;
  try {
    transcript = await transcribe(filePath, mime);
  } catch (err) {
    await repo.markRecordingFailed(recordingId, err.code || 'ASR_FAILED');
    await repo.failBubbleProcessing(bubbleId);
    return;
  }

  if (!transcript) {
    await repo.markRecordingFailed(recordingId, 'ASR_EMPTY');
    await repo.failBubbleProcessing(bubbleId);
    return;
  }

  await repo.markRecordingTranscribed(recordingId, transcript);

  let summary;
  try {
    const system = await loadSummaryPrompt();
    summary = await jsonObjectChat({
      schema: summarySchema,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: transcript },
      ],
    });
  } catch (err) {
    await repo.markRecordingFailed(recordingId, err.code || 'SUMMARY_FAILED');
    await repo.failBubbleProcessing(bubbleId);
    return;
  }

  await repo.finishBubbleProcessing(bubbleId, {
    title: clampTitle(summary.title),
    content: summary.content,
    tags: summary.tags,
    source: transcript,
  });
}
