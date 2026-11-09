import { Router } from 'express';

export function createJarRouter(repo) {
  const router = Router();

  router.get('/', async (req, res, next) => {
    try {
      const data = await repo.listJars();
      res.json({ code: 0, data, message: 'ok' });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:id', async (req, res, next) => {
    try {
      const data = await repo.getJar(req.params.id);
      if (!data) {
        return res.status(404).json({ code: 404, data: null, message: 'jar not found' });
      }
      res.json({ code: 0, data, message: 'ok' });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
