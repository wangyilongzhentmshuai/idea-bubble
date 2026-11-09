import path from 'node:path';
import { config } from '../config.js';
import { newId } from '../utils/ids.js';
import { writeSse } from '../utils/sse.js';
import { transcribe } from './asr.js';
import { jsonObjectChat } from './ark.js';
import { buildBubble } from './bubble-factory.js';
import { loadSummaryPrompt } from './prompts.js';
import { summarySchema } from '../utils/schemas.js';

export async function runAudioPipeline({ res, repo, file, duration, mime }) {
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

  writeSse(res, 'stage', { stage: 'uploading', progress: 100 });

  /* 阶段一：语音转写 */
  writeSse(res, 'stage', { stage: 'transcribing' });
  let transcript;
  try {
    transcript = await transcribe(file.path, mime);
  } catch (err) {
    const code = err.code || 'ASR_FAILED';
    await repo.markRecordingFailed(recordingId, code);
    writeSse(res, 'error', {
      stage: 'transcribing',
      code,
      message: err.message || '语音转写失败',
    });
    res.end();
    return;
  }

  if (!transcript) {
    await repo.markRecordingFailed(recordingId, 'ASR_EMPTY');
    writeSse(res, 'error', {
      stage: 'transcribing',
      code: 'ASR_EMPTY',
      message: '未识别到有效语音内容',
    });
    res.end();
    return;
  }

  /* 转写成功即持久化，后续总结失败也不丢 transcript */
  await repo.markRecordingTranscribed(recordingId, transcript);

  /* 阶段二：大模型总结 */
  writeSse(res, 'stage', { stage: 'summarizing' });
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
    const code = err.code || 'SUMMARY_FAILED';
    await repo.markRecordingFailed(recordingId, code);
    writeSse(res, 'error', {
      stage: 'summarizing',
      code,
      message: err.message || '灵感总结失败',
    });
    res.end();
    return;
  }

  const bubble = await buildBubble(repo, {
    summary,
    source: transcript,
    origin: 'voice',
    recordingId,
  });

  await repo.addBubbleOnly(bubble);

  const recording = await repo.getRecording(recordingId);
  writeSse(res, 'done', { recording, bubble });
  res.end();
}
