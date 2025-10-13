// src/routes/reviewRoutes.ts - Rutas de reseñas
import { Router } from 'express';
import {
  createReview,
  getProductReviews,
  checkUserReview,
  getAllReviewsAdmin,
  updateReviewStatus,
  deleteReview
} from '../controllers/reviewController';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

// ===== RUTAS PÚBLICAS =====
// Obtener reseñas de un producto (sin autenticación)
router.get('/products/:productId', getProductReviews);

// ===== RUTAS PROTEGIDAS (Cliente) =====
// Crear reseña (requiere login)
router.post('/', authenticateToken, createReview);

// Verificar si el usuario ya dejó reseña
router.get('/products/:productId/check', authenticateToken, checkUserReview);

// ===== RUTAS DE ADMIN =====
// Obtener todas las reseñas
router.get('/admin/all', authenticateToken, requireRole(['ADMIN']), getAllReviewsAdmin);

// Aprobar/rechazar reseña
router.patch('/admin/:id/status', authenticateToken, requireRole(['ADMIN']), updateReviewStatus);

// Eliminar reseña
router.delete('/admin/:id', authenticateToken, requireRole(['ADMIN']), deleteReview);

export default router;