// src/routes/accountRoutes.ts - Rutas para cuenta de usuario
import { Router } from 'express';
import { 
  getProfile,
  updateProfile,
  getOrders,
  getOrderById,
  getAddresses,
  createAddress,
  updateAddress,
  deleteAddress,
  getPaymentMethods,
  createPaymentMethod,
  createPaymentMethodWithToken,
  deletePaymentMethod,
  getAccountStats,
  downloadInvoice
} from '../controllers/accountController';
import { authenticateToken } from '../middleware/auth';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting optimizado para producción
const accountLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 20, // 20 intentos por IP (permite errores legítimos de usuarios)
  message: {
    error: 'Demasiados intentos de autenticación. Intente nuevamente en 15 minutos.'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Permite bypass para desarrollo
  skip: (req) => process.env.NODE_ENV === 'development'
});

const writeOperationsLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 10, // 10 registros por hora (suficiente para uso legítimo)
  message: {
    error: 'Demasiados registros desde esta IP. Intente nuevamente en una hora.'
  },
  // Permite bypass para desarrollo
  skip: (req) => process.env.NODE_ENV === 'development'
});

// Aplicar autenticación y rate limiting a todas las rutas
router.use(authenticateToken);
router.use(accountLimiter);

// ==== RUTAS DE PERFIL ====
// Obtener perfil del usuario
router.get('/profile', getProfile);

// Actualizar perfil del usuario
router.put('/profile', writeOperationsLimiter, updateProfile);

// Obtener estadísticas de la cuenta
router.get('/stats', getAccountStats);

// ==== RUTAS DE PEDIDOS ====
// Obtener historial de pedidos
router.get('/orders', getOrders);

// Obtener detalles de un pedido específico
router.get('/orders/:id', getOrderById);

// ==== RUTAS DE DIRECCIONES ====
// Obtener todas las direcciones del usuario
router.get('/addresses', getAddresses);

// Crear nueva dirección
router.post('/addresses', writeOperationsLimiter, createAddress);

// Actualizar dirección existente
router.put('/addresses/:id', writeOperationsLimiter, updateAddress);

// Eliminar dirección
router.delete('/addresses/:id', writeOperationsLimiter, deleteAddress);

// ==== RUTAS DE MÉTODOS DE PAGO ====
// Obtener métodos de pago del usuario
router.get('/payment-methods', getPaymentMethods);

// Crear nuevo método de pago
router.post('/payment-methods', writeOperationsLimiter, createPaymentMethod);

// Eliminar método de pago
router.delete('/payment-methods/:id', writeOperationsLimiter, deletePaymentMethod);

router.post('/payment-methods', authenticateToken, createPaymentMethodWithToken);

// Descargar factura de un pedido
router.get('/orders/:orderId/invoice', downloadInvoice);

export default router;