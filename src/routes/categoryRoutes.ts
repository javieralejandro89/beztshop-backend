// src/routes/categoryRoutes.ts - Rutas de categorías
import { Router } from 'express';
import { 
  getCategories,
  getCategoryBySlug,
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoriesAdmin
} from '../controllers/categoryController';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

// Rutas públicas (sin autenticación)
router.get('/', getCategories);
router.get('/:slug', getCategoryBySlug);

// Rutas protegidas (solo admin)
router.get('/admin/all', authenticateToken, requireRole(['ADMIN']), getCategoriesAdmin);
router.post('/', authenticateToken, requireRole(['ADMIN']), createCategory);
router.put('/:id', authenticateToken, requireRole(['ADMIN']), updateCategory);
router.delete('/:id', authenticateToken, requireRole(['ADMIN']), deleteCategory);

export default router;