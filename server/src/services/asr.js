import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { rawChat, ArkError } from './ark.js';

const MIME_FORMAT = new Map([
  ['audio/mp4', 'm4a'],
  ['audio/mpeg', 'mp3'],
  ['audio/mp3', 'mp3'],
  ['audio/wav', 'wav'],
  ['audio/x-wav', 'wav'],
  ['audio/aac', 'm4a'],
  ['audio/m4a', 'm4a'],
  ['audio/x-m4a', 'm4a'],
  ['audio/webm', 'webm'],
]);

/* 对上层屏蔽提交与编码细节，只暴露 transcribe(audioPath, mime) => text */
export async function transcribe(audioPath, mime) {
  const absPath = path.isAbsolute(audioPath)
    ? audioPath
    : path.join(config.paths.serverRoot, audioPath);

  let bytes;
  try {
    bytes = await fs.readFile(absPath);
  } catch {
    throw new ArkError('AUDIO_FILE_MISSING', '音频文件读取失败', {
      retryable: false,
    });
  }

  const format =
    MIME_FORMAT.get(mime) || path.extname(absPath).slice(1).toLowerCase();
  const base64 = bytes.toString('base64');

  const text = await rawChat({
    model: config.asr.modelId,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'input_audio',
            input_audio: { data: base64, format },
          },
          {
            type: 'text',
            text: '请逐字转写音频中的人声内容，只输出转写文字，不要总结、不要添加解释，保留原意并正确使用标点。',
          },
        ],
      },
    ],
  });

  return text.trim();
}
