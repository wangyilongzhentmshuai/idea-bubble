import { Router } from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { newId } from '../utils/ids.js';
import { createPendingIdea, processPendingIdea } from '../services/pipeline.js';
import { jsonObjectChat, ArkError } from '../services/ark.js';
import { buildBubble } from '../services/bubble-factory.js';
import { loadSummaryPrompt } from '../services/prompts.js';
import { summarySchema, fromTextInputSchema } from '../utils/schemas.js';

const ALLOWED_MIME = new Map([
  ['audio/webm', '.webm'],
  ['audio/mp4', '.mp4'],
  ['audio/mpeg', '.mp3'],
  ['audio/mp3', '.mp3'],
  ['audio/wav', '.wav'],
  ['audio/x-wav', '.wav'],
  ['audio/m4a', '.m4a'],
  ['audio/x-m4a', '.m4a'],
]);

function dayStamp() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

const storage = multer.diskStorage({
  destination(req, file, cb) {
    const dir = path.join(config.paths.audioDir, dayStamp());
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename(req, file, cb) {
    const id = newId('rec');
    const ext = ALLOWED_MIME.get(file.mimetype) || path.extname(file.originalname);
    cb(null, `${id}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: config.uploadLimitMb * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (ALLOWED_MIME.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('UNSUPPORTED_MEDIA_TYPE'));
    }
  },
});

export function createIdeaRouter(repo) {
  const router = Router();

  router.post('/from-text', async (req, res) => {
    const parsed = fromTextInputSchema.safeParse(req.body);
    if (!parsed.success) {
      return res
        .status(400)
        .json({ code: 400, data: null, message: '文本内容不能为空' });
    }
    try {
      const system = await loadSummaryPrompt();
      const summary = await jsonObjectChat({
        schema: summarySchema,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: parsed.data.text },
        ],
      });
      const bubble = await buildBubble(repo, {
        summary,
        source: parsed.data.text,
        origin: 'text',
      });
      await repo.addBubbleOnly(bubble);
      return res.json({ code: 0, data: { bubble }, message: 'ok' });
    } catch (err) {
      if (err instanceof ArkError) {
        const status = err.status || 500;
        return res.status(status).json({
          code: status,
          data: null,
          message: err.message,
        });
      }
      console.error('[from-text error]', err);
      return res
        .status(500)
        .json({ code: 500, data: null, message: 'internal server error' });
    }
  });

  router.post('/from-audio', (req, res) => {
    upload.single('audio')(req, res, async (err) => {
      if (err) {
        if (req.file && req.file.path) {
          fs.rmSync(req.file.path, { force: true });
        }
        if (err.code === 'LIMIT_FILE_SIZE') {
          return res.status(413).json({
            code: 413,
            data: null,
            message: `音频超出 ${config.uploadLimitMb}MB 限制`,
          });
        }
        return res.status(400).json({
          code: 400,
          data: null,
          message: '不支持的音频格式，仅允许 webm/mp3/wav/m4a/mp4',
        });
      }
      if (!req.file) {
        return res
          .status(400)
          .json({ code: 400, data: null, message: '缺少 audio 文件字段' });
      }

      let bubble;
      try {
        const result = await createPendingIdea({
          repo,
          file: req.file,
          duration: Number(req.body.duration) || 0,
          mime: req.file.mimetype,
        });
        bubble = result.bubble;
        res.json({ code: 0, data: { bubble }, message: 'ok' });
      } catch (e) {
        fs.rmSync(req.file.path, { force: true });
        console.error('[create pending error]', e);
        return res
          .status(500)
          .json({ code: 500, data: null, message: 'internal server error' });
      }

      /* 响应已返回，后台异步处理，不阻塞下一次录音 */
      processPendingIdea({
        repo,
        recordingId: bubble.recordingId,
        bubbleId: bubble.id,
        filePath: req.file.path,
        mime: req.file.mimetype,
      }).catch((e) => console.error('[background process error]', e));
    });
  });

  return router;
}
