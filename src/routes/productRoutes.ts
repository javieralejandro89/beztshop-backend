// src/routes/productRoutes.ts - Rutas de productos
import { Router } from 'express';
import { 
  getProducts, 
  getProductBySlug, 
  getFeaturedProducts,
  createProduct,
  updateProduct,
  deleteProduct,
  getProductsAdmin,
  getProductById
} from '../controllers/productController';
import { authenticateToken, requireRole } from '../middleware/auth';

const router = Router();

// Rutas públicas (sin autenticación)
router.get('/', getProducts);
router.get('/featured', getFeaturedProducts);
router.get('/:slug', getProductBySlug);

// Rutas protegidas (solo admin)
router.get('/admin/all', authenticateToken, requireRole(['ADMIN']), getProductsAdmin);
router.post('/', authenticateToken, requireRole(['ADMIN']), createProduct);
router.put('/:id', authenticateToken, requireRole(['ADMIN']), updateProduct);
router.delete('/:id', authenticateToken, requireRole(['ADMIN']), deleteProduct);
router.get('/admin/:id', authenticateToken, requireRole(['ADMIN']), getProductById);

export default router;