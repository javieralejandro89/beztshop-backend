// src/routes/mercadolibreRoutes.ts
import express from 'express';
import { mercadolibreController } from '../controllers/mercadolibreController';
import { authenticateToken } from '../middleware/auth';

const router = express.Router();

// Rutas públicas (callback de ML)
router.get('/callback', mercadolibreController.handleCallback);

// Rutas protegidas (requieren admin)
router.get('/auth-url', authenticateToken, mercadolibreController.getAuthUrl);
router.get('/check-auth', authenticateToken, mercadolibreController.checkAuth);

// Gestión de productos
router.post('/publish', authenticateToken, mercadolibreController.publishProduct);
router.post('/publish-multiple', authenticateToken, mercadolibreController.publishMultipleProducts);
router.get('/published', authenticateToken, mercadolibreController.getPublishedProducts);

// Actualización de productos
router.put('/update-price', authenticateToken, mercadolibreController.updatePrice);
router.put('/update-stock', authenticateToken, mercadolibreController.updateStock);
router.put('/update-status', authenticateToken, mercadolibreController.updateStatus);
router.delete('/product/:mlItemId', authenticateToken, mercadolibreController.deleteProduct);

// Sincronización
router.post('/sync/:productId', authenticateToken, mercadolibreController.syncProduct);

export default router;