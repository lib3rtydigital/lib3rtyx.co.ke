import express from 'express';

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({ ok: true, message: 'Admin route placeholder' });
});

export default router;
