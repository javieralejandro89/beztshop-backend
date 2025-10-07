// src/routes/squareRoutes.ts - Rutas para pagos con Square
import express from 'express';
import rateLimit from 'express-rate-limit';
import { authenticateToken } from '../middleware/auth';
import {
  processPayment,
  getPaymentInfo,
  processRefund,
  getSquareConfig,
  squareWebhook,
  squareHealthCheck
} from '../controllers/squareController';

const router = express.Router();

// Rate limiting específico para pagos
const paymentRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // máximo 5 intentos de pago por ventana
  message: {
    error: 'Demasiados intentos de pago. Intenta nuevamente en 15 minutos.',
    code: 'PAYMENT_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Solo aplicar rate limiting en producción
  skip: (req) => process.env.NODE_ENV === 'development'
});

// Rate limiting para reembolsos (más restrictivo)
const refundRateLimit = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // máximo 3 reembolsos por hora
  message: {
    error: 'Demasiados intentos de reembolso. Intenta nuevamente en 1 hora.',
    code: 'REFUND_RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development'
});

// ==== RUTAS PÚBLICAS ====

/**
 * GET /api/square/config
 * Obtener configuración de Square para el frontend
 * No requiere autenticación
 */
router.get('/config', getSquareConfig);

/**
 * GET /api/square/health
 * Health check de Square
 * No requiere autenticación
 */
router.get('/health', squareHealthCheck);

/**
 * POST /api/square/webhook
 * Webhook para notificaciones de Square
 * No requiere autenticación (Square envía las notificaciones)
 */
router.post('/webhook', squareWebhook);

// ==== RUTAS PROTEGIDAS ====

/**
 * POST /api/square/process-payment
 * Procesar un pago con Square
 * Requiere autenticación + rate limiting
 */
router.post('/process-payment', authenticateToken, paymentRateLimit, processPayment);

/**
 * GET /api/square/payment/:paymentId
 * Obtener información de un pago específico
 * Requiere autenticación
 */
router.get('/payment/:paymentId', authenticateToken, getPaymentInfo);

/**
 * POST /api/square/refund
 * Procesar un reembolso
 * Requiere autenticación + rate limiting más restrictivo
 */
router.post('/refund', authenticateToken, refundRateLimit, processRefund);

// ==== MIDDLEWARE DE MANEJO DE ERRORES ====

// Middleware específico para errores de Square
router.use((error: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('Error en rutas Square:', error);

  // Errores específicos de Square
  if (error.name === 'SquareError') {
    return res.status(400).json({
      error: 'Error de Square',
      details: error.errors || error.message,
      code: 'SQUARE_API_ERROR'
    });
  }

  // Errores de rate limiting
  if (error.status === 429) {
    return res.status(429).json({
      error: error.message,
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: error.retryAfter
    });
  }

  // Errores de validación
  if (error.name === 'ZodError') {
    return res.status(400).json({
      error: 'Datos inválidos',
      details: error.issues,
      code: 'VALIDATION_ERROR'
    });
  }

  // Error genérico
  res.status(500).json({
    error: 'Error interno del servidor',
    code: 'INTERNAL_SERVER_ERROR',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

export default router;