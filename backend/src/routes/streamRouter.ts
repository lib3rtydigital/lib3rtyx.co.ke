import express from 'express';

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({ ok: true, stream: null });
});

export default router;
