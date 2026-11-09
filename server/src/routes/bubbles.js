import { Router } from 'express';
import { config } from '../config.js';
import { ArkError } from '../services/ark.js';
import { archiveBubble } from '../services/archive.js';
import { associateBubble } from '../services/associate.js';
import { fuseBubble } from '../services/fuse.js';
import { getIdempotent, setIdempotent } from '../utils/idempotency.js';
import { fuseInputSchema } from '../utils/schemas.js';

export function createBubbleRouter(repo) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const { status } = req.query;
      if (status !== undefined && !['desk', 'archived'].includes(status)) {
        return res
          .status(400)
          .json({ code: 400, data: null, message: 'status 只能是 desk 或 archived' });
      }
      const data = await repo.listBubbles(status);
      res.json({ code: 0, data, message: 'ok' });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const data = await repo.getBubble(req.params.id);
      if (!data) {
        return res.status(404).json({ code: 404, data: null, message: 'bubble not found' });
      }
      res.json({ code: 0, data, message: 'ok' });
    } catch (err) {
      next(err);
    }
  });

  /* 归档装罐：分类 → 归一 → 并罐/建罐；分类失败 202 并标记 unclassified */
  router.post('/:id/archive', async (req, res, next) => {
    try {
      const bubble = await repo.getBubble(req.params.id);
      if (!bubble) {
        return res
          .status(404)
          .json({ code: 404, data: null, message: 'bubble not found' });
      }
      if (bubble.status === 'archived') {
        const jar = bubble.jarId ? await repo.getJar(bubble.jarId) : null;
        return res.json({
          code: 0,
          data: {
            theme: jar?.theme ?? null,
            jarId: bubble.jarId,
            isNewJar: false,
          },
          message: 'ok',
        });
      }
      try {
        const result = await archiveBubble(bubble, repo);
        return res.json({ code: 0, data: result, message: 'ok' });
      } catch (err) {
        if (err instanceof ArkError) {
          await repo.markUnclassified(bubble.id);
          return res.status(202).json({
            code: 202,
            data: { unclassified: true },
            message: '主题分类失败，稍后可重试',
          });
        }
        throw err;
      }
    } catch (err) {
      next(err);
    }
  });

  /* 关联评分：仅返回达标候选，无候选返回空数组 */
  router.post('/:id/associate', async (req, res, next) => {
    try {
      const base = await repo.getBubble(req.params.id);
      if (!base) {
        return res
          .status(404)
          .json({ code: 404, data: null, message: 'bubble not found' });
      }
      const candidates = await associateBubble(
        base,
        repo,
        config.associationThreshold
      );
      return res.json({ code: 0, data: { candidates }, message: 'ok' });
    } catch (err) {
      next(err);
    }
  });

  /* 融合生成：Idempotency-Key 防重，同事务落库可追溯 */
  router.post('/:id/fuse', async (req, res, next) => {
    try {
      const base = await repo.getBubble(req.params.id);
      if (!base) {
        return res
          .status(404)
          .json({ code: 404, data: null, message: 'bubble not found' });
      }
      const parsed = fuseInputSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({
          code: 400,
          data: null,
          message: 'targetIds 需为 1 到 2 个有效灵感',
        });
      }

      const key = req.get('Idempotency-Key');
      const cached = getIdempotent(key);
      if (cached) {
        return res.json({ code: 0, data: { bubble: cached }, message: 'ok' });
      }

      const bubble = await fuseBubble(base, parsed.data.targetIds, repo);
      setIdempotent(key, bubble);
      return res.json({ code: 0, data: { bubble }, message: 'ok' });
    } catch (err) {
      if (err.code === 'FUSE_TARGET_NOT_FOUND') {
        return res
          .status(404)
          .json({ code: 404, data: null, message: err.message });
      }
      if (err instanceof ArkError) {
        const status = err.status || 500;
        return res
          .status(status)
          .json({ code: status, data: null, message: err.message });
      }
      next(err);
    }
  });

  return router;
}
