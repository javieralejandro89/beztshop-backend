// src/routes/wishlistRoutes.ts - Rutas para wishlist/favoritos
import { Router } from 'express';
import { 
  getWishlist,
  addToWishlist,
  removeFromWishlist,
  checkWishlistStatus,
  clearWishlist
} from '../controllers/wishlistController';
import { authenticateToken } from '../middleware/auth';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting para wishlist
const wishlistLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // 100 requests por ventana
  message: {
    error: 'Demasiadas peticiones. Intente nuevamente en 15 minutos.'
  }
});

// Rate limiting más estricto para operaciones de escritura
const writeOperationsLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 30, // 30 operaciones por ventana
  message: {
    error: 'Demasiadas operaciones. Intente nuevamente en 5 minutos.'
  }
});

// Aplicar autenticación y rate limiting a todas las rutas
router.use(authenticateToken);
router.use(wishlistLimiter);

// ==== RUTAS DE WISHLIST ====

// Obtener wishlist completa del usuario
router.get('/', getWishlist);

// Agregar producto a wishlist
router.post('/add', writeOperationsLimiter, addToWishlist);

// Eliminar producto de wishlist
router.delete('/remove/:productId', writeOperationsLimiter, removeFromWishlist);

// Verificar si un producto está en wishlist
router.get('/check/:productId', checkWishlistStatus);

// Limpiar toda la wishlist
router.delete('/clear', writeOperationsLimiter, clearWishlist);

export default router;