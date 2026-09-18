import { Router } from 'express';
import { createCheckout, verifyCheckout } from '../controllers/checkoutController.js';

const router = Router();

router.post('/', createCheckout);
router.get('/verify', verifyCheckout);

export default router;
