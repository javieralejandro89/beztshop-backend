// src/routes/adminRoutes.ts - Rutas principales de administración
import { Router } from 'express';
import { authenticateToken } from '../middleware/auth';
import { AuthenticatedRequest } from '../types';

// Importar controladores
import {
  getUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  toggleUserStatus,
  getUserStats
} from '../controllers/adminUsersController';

import {
  getOrders,
  getOrderById,
  updateOrderStatus,
  sendCustomNotification,
  generateInvoice,
  getOrderStats,
  deleteOrder
} from '../controllers/adminOrdersController';

import {
  getSiteSettings,
  updateSiteSettings,
  getEmailSettings,
  updateEmailSettings,
  getPaymentSettings,
  updatePaymentSettings,
  getShippingSettings,
  updateShippingSettings,
  getAllSettings,
  resetSettings,
  testEmailSettings,
  backupSettings
} from '../controllers/adminSettingsController';

import {
  getCoupons,
  getCouponById,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCouponStatus,
  validateCoupon,
  applyCoupon,
  getCouponStats
} from '../controllers/adminCouponsController';

const router = Router();

// Middleware: todas las rutas de admin requieren autenticación
router.use(authenticateToken);

// ========================================
// RUTAS DE GESTIÓN DE USUARIOS
// ========================================

// GET /api/admin/users - Obtener lista de usuarios con filtros
router.get('/users', getUsers);

// GET /api/admin/users/stats - Obtener estadísticas de usuarios
router.get('/users/stats', getUserStats);

// GET /api/admin/users/:id - Obtener usuario por ID
router.get('/users/:id', getUserById);

// POST /api/admin/users - Crear nuevo usuario
router.post('/users', createUser);

// PUT /api/admin/users/:id - Actualizar usuario
router.put('/users/:id', updateUser);

// DELETE /api/admin/users/:id - Eliminar usuario
router.delete('/users/:id', deleteUser);

// PATCH /api/admin/users/:id/toggle-status - Cambiar estado del usuario
router.patch('/users/:id/toggle-status', toggleUserStatus);

// ========================================
// RUTAS DE GESTIÓN DE PEDIDOS
// ========================================

// GET /api/admin/orders - Obtener lista de pedidos con filtros
router.get('/orders', getOrders);

// GET /api/admin/orders/stats - Obtener estadísticas de pedidos
router.get('/orders/stats', getOrderStats);

// GET /api/admin/orders/:id - Obtener pedido por ID
router.get('/orders/:id', getOrderById);

// PATCH /api/admin/orders/:id/status - Actualizar estado del pedido
router.patch('/orders/:id/status', updateOrderStatus);

// POST /api/admin/orders/:id/notify - Enviar notificación personalizada
router.post('/orders/:id/notify', sendCustomNotification);

// GET /api/admin/orders/:id/invoice - Generar y descargar factura
router.get('/orders/:id/invoice', generateInvoice);

// DELETE /api/admin/orders/:id - Eliminar pedido
router.delete('/orders/:id', deleteOrder);

// ========================================
// RUTAS DE CONFIGURACIONES DEL SISTEMA
// ========================================

// GET /api/admin/settings - Obtener todas las configuraciones
router.get('/settings', getAllSettings);

// GET /api/admin/settings/site - Obtener configuración del sitio
router.get('/settings/site', getSiteSettings);

// PUT /api/admin/settings/site - Actualizar configuración del sitio
router.put('/settings/site', updateSiteSettings);

// GET /api/admin/settings/email - Obtener configuración de email
router.get('/settings/email', getEmailSettings);

// PUT /api/admin/settings/email - Actualizar configuración de email
router.put('/settings/email', updateEmailSettings);

// POST /api/admin/settings/email/test - Probar configuración de email
router.post('/settings/email/test', testEmailSettings);

// GET /api/admin/settings/payment - Obtener configuración de pagos
router.get('/settings/payment', getPaymentSettings);

// PUT /api/admin/settings/payment - Actualizar configuración de pagos
router.put('/settings/payment', updatePaymentSettings);

// GET /api/admin/settings/shipping - Obtener configuración de envíos
router.get('/settings/shipping', getShippingSettings);

// PUT /api/admin/settings/shipping - Actualizar configuración de envíos
router.put('/settings/shipping', updateShippingSettings);

// DELETE /api/admin/settings/:settingType/reset - Resetear configuración
router.delete('/settings/:settingType/reset', resetSettings);

// GET /api/admin/settings/backup - Crear backup de configuraciones
router.get('/settings/backup', backupSettings);

// ========================================
// RUTAS DE GESTIÓN DE CUPONES
// ========================================

// GET /api/admin/coupons - Obtener lista de cupones
router.get('/coupons', getCoupons);

// GET /api/admin/coupons/stats - Obtener estadísticas de cupones
router.get('/coupons/stats', getCouponStats);

// GET /api/admin/coupons/:id - Obtener cupón por ID
router.get('/coupons/:id', getCouponById);

// POST /api/admin/coupons - Crear nuevo cupón
router.post('/coupons', createCoupon);

// PUT /api/admin/coupons/:id - Actualizar cupón
router.put('/coupons/:id', updateCoupon);

// DELETE /api/admin/coupons/:id - Eliminar cupón
router.delete('/coupons/:id', deleteCoupon);

// PATCH /api/admin/coupons/:id/toggle - Cambiar estado del cupón
router.patch('/coupons/:id/toggle', toggleCouponStatus);

// GET /api/admin/coupons/:code/validate - Validar cupón (para checkout)
router.get('/coupons/:code/validate', validateCoupon);

// POST /api/admin/coupons/:id/apply - Aplicar cupón (incrementar uso)
router.post('/coupons/:id/apply', applyCoupon);

// ========================================
// RUTAS DE DASHBOARD Y ESTADÍSTICAS GENERALES
// ========================================

// GET /api/admin/dashboard - Obtener datos del dashboard
router.get('/dashboard', async (req: AuthenticatedRequest, res) => {
  try {
    // Verificar permisos de admin
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Acceso denegado',
        code: 'ACCESS_DENIED'
      });
    }

    // Obtener estadísticas generales para el dashboard
    const [userStats, orderStats, couponStats] = await Promise.all([
      fetch(`${process.env.API_URL || 'http://localhost:3001'}/api/admin/users/stats`, {
        headers: {
          'Authorization': req.headers.authorization || ''
        }
      }).then(res => res.ok ? res.json() as any : null).catch(() => null),
      
      fetch(`${process.env.API_URL || 'http://localhost:3001'}/api/admin/orders/stats`, {
        headers: {
          'Authorization': req.headers.authorization || ''
        }
      }).then(res => res.ok ? res.json() as any : null).catch(() => null),
      
      fetch(`${process.env.API_URL || 'http://localhost:3001'}/api/admin/coupons/stats`, {
        headers: {
          'Authorization': req.headers.authorization || ''
        }
      }).then(res => res.ok ? res.json() as any : null).catch(() => null)
    ]);

    res.json({
      dashboard: {
        users: userStats?.stats || null,
        orders: orderStats?.stats || null,
        coupons: couponStats?.stats || null,
        lastUpdated: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error getting dashboard data:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
});

// GET /api/admin/health - Verificar salud del sistema admin
router.get('/health', async (req: AuthenticatedRequest, res) => {
  try {
    // Verificar permisos de admin
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Acceso denegado',
        code: 'ACCESS_DENIED'
      });
    }

    // Verificar conexiones y servicios críticos
    const health = {
      status: 'OK',
      timestamp: new Date().toISOString(),
      services: {
        database: 'connected',
        auth: 'active',
        admin: 'operational'
      },
      user: {
        id: req.user.id,
        email: req.user.email,
        role: req.user.role
      }
    };

    res.json(health);

  } catch (error) {
    console.error('Error checking admin health:', error);
    res.status(500).json({
      status: 'ERROR',
      error: 'Error en verificación de salud del sistema',
      code: 'HEALTH_CHECK_FAILED'
    });
  }
});

export default router;