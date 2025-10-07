// src/routes/imageRoutes.ts - Rutas para imágenes
import { Router } from 'express';
import { 
  uploadProductImages, 
  deleteProductImage,
  updateProductImages
} from '../controllers/imageController';
import { authenticateToken, requireRole } from '../middleware/auth';
import { uploadProductImages as uploadMiddleware } from '../config/cloudinary';

const router = Router();

// Rutas protegidas (solo admin)
router.post(
  '/products/upload', 
  authenticateToken, 
  requireRole(['ADMIN']), 
  uploadMiddleware.array('images', 5), // Máximo 5 imágenes
  uploadProductImages
);

router.delete(
  '/products/:publicId', 
  authenticateToken, 
  requireRole(['ADMIN']), 
  deleteProductImage
);

router.put(
  '/products/:productId', 
  authenticateToken, 
  requireRole(['ADMIN']), 
  updateProductImages
);

export default router;