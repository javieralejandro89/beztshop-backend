// src/routes/checkoutRoutes.ts - Rutas de checkout
import { Router } from 'express';
import { verifyStock } from '../controllers/checkoutController'; // Adjust path as needed
import {
  getCheckoutSession,
  validateCoupon,
  calculateOrderTotals,
  createOrder  
} from '../controllers/checkoutController';
import { authenticateToken } from '../middleware/auth';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting para checkout
const checkoutLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 50, // 50 requests por ventana
  message: {
    error: 'Demasiadas peticiones. Intente nuevamente en 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Permite bypass para desarrollo
  skip: (req) => process.env.NODE_ENV === 'development'
});

// Rate limiting más estricto para crear pedidos
const orderCreationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10, // 10 pedidos por hora
  message: {
    error: 'Demasiados pedidos creados. Intente nuevamente en una hora.'
  },
  // Permite bypass para desarrollo
  skip: (req) => process.env.NODE_ENV === 'development'
});

// Aplicar autenticación y rate limiting a todas las rutas
router.use(authenticateToken);
router.use(checkoutLimiter);

// ==== RUTAS DE CHECKOUT ====

// Obtener información inicial del checkout (direcciones, métodos de pago, etc.)
router.get('/session', getCheckoutSession);

// Validar cupón de descuento
router.post('/validate-coupon', validateCoupon);

// Calcular totales del pedido (para actualizaciones en tiempo real)
router.post('/calculate-totals', calculateOrderTotals);

// Crear pedido final
router.post('/create-order', orderCreationLimiter, createOrder);

router.post('/verify-stock', authenticateToken, verifyStock);

export default router;