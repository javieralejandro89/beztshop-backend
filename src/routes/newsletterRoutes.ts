// src/routes/newsletterRoutes.ts
import { Router } from 'express';
import * as newsletterController from '../controllers/newsletterController';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

// === RUTAS PÚBLICAS ===
router.post('/subscribe', newsletterController.subscribe);
router.post('/unsubscribe/:token', newsletterController.unsubscribe);

// === RUTAS DE ADMIN (requieren autenticación) ===
// Aplicar autenticación y verificación de rol ADMIN a todas las rutas siguientes
router.get('/subscribers', authenticateToken, requireRole(['ADMIN']), newsletterController.getSubscribers);
router.get('/campaigns', authenticateToken, requireRole(['ADMIN']), newsletterController.getCampaigns);
router.post('/campaigns', authenticateToken, requireRole(['ADMIN']), newsletterController.createCampaign);
router.post('/campaigns/:id/send', authenticateToken, requireRole(['ADMIN']), newsletterController.sendCampaign);
router.post('/campaigns/preview', authenticateToken, requireRole(['ADMIN']), newsletterController.previewCampaign);
router.get('/stats', authenticateToken, requireRole(['ADMIN']), newsletterController.getNewsletterStats);

export default router;