// src/routes/authRoutes.ts - Rutas de autenticación actualizadas con refresh tokens
import { Router } from 'express';
import { 
  register, 
  login, 
  refreshToken, // NUEVO: Endpoint para renovar tokens
  logout,
  logoutAllDevices, // NUEVO: Cerrar todas las sesiones
  getProfile, 
  updateProfile, 
  changePassword,
  forgotPassword, 
  resetPassword,
  verifyToken
} from '../controllers/authController';
import { authenticateToken, authenticateRefreshToken } from '../middleware/auth';
import rateLimit from 'express-rate-limit';

const router = Router();

// Rate limiting específico para autenticación
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 5, // 5 intentos por IP
  message: {
    error: 'Demasiados intentos de autenticación. Intente nuevamente en 15 minutos.',
    code: 'RATE_LIMIT_EXCEEDED'
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip para desarrollo
  skip: (req) => process.env.NODE_ENV === 'development'
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hora
  max: 3, // 3 registros por hora por IP
  message: {
    error: 'Demasiados registros desde esta IP. Intente nuevamente en una hora.',
    code: 'REGISTER_RATE_LIMIT_EXCEEDED'
  },
  skip: (req) => process.env.NODE_ENV === 'development'
});

// NUEVO: Rate limiting para refresh tokens
const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // 10 renovaciones por IP (permite renovaciones frecuentes)
  message: {
    error: 'Demasiadas renovaciones de token. Intente nuevamente en 15 minutos.',
    code: 'REFRESH_RATE_LIMIT_EXCEEDED'
  },
  skip: (req) => process.env.NODE_ENV === 'development'
});

// ==== RUTAS PÚBLICAS (sin autenticación) ====

// Registro de usuario
router.post('/register', registerLimiter, register);

// Login de usuario
router.post('/login', authLimiter, login);

// NUEVO: Renovar access token usando refresh token
router.post('/refresh', refreshLimiter, authenticateRefreshToken, refreshToken);

// ==== RUTAS PROTEGIDAS (requieren access token) ====

// Obtener perfil del usuario
router.get('/profile', authenticateToken, getProfile);

// Actualizar perfil del usuario
router.put('/profile', authenticateToken, updateProfile);

// Cambiar contraseña
router.post('/change-password', authenticateToken, changePassword);

// Verificar si el token es válido
router.get('/verify-token', authenticateToken, verifyToken);

// ALIAS: También disponible como /verify para compatibilidad
router.get('/verify', authenticateToken, verifyToken);

// Logout (cerrar sesión actual)
router.post('/logout', authenticateToken, logout);

// NUEVO: Logout de todos los dispositivos
router.post('/logout-all', authenticateToken, logoutAllDevices);

router.post('/forgot-password', forgotPassword);
router.post('/reset-password', resetPassword);

// ==== RUTAS DE UTILIDAD ====

// Endpoint para verificar conectividad (debugging)
router.get('/ping', (req, res) => {
  res.json({
    message: 'Auth service is running',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

export default router;