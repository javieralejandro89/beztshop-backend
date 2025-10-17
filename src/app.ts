// src/app.ts - Servidor principal actualizado con soporte para refresh tokens
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import cookieParser from 'cookie-parser'; // NUEVO: Para manejar cookies de refresh tokens
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// Middleware personalizado
import { errorHandler, requestLogger } from './middleware/errorHandler';
import { authenticateToken, cleanupExpiredTokens } from './middleware/auth';

// Importar rutas
import authRoutes from './routes/authRoutes';
import productRoutes from './routes/productRoutes';
import categoryRoutes from './routes/categoryRoutes';
import imageRoutes from './routes/imageRoutes';
import accountRoutes from './routes/accountRoutes';
import wishlistRoutes from './routes/wishlistRoutes';
import checkoutRoutes from './routes/checkoutRoutes';
import adminRoutes from './routes/adminRoutes';
import stripeRoutes from './routes/stripeRoutes';
import newsletterRoutes from './routes/newsletterRoutes';
import reviewRoutes from './routes/reviewRoutes';
import mercadolibreRoutes from './routes/mercadolibreRoutes';


// Debug - verificar que las rutas se importan
console.log('authRoutes:', typeof authRoutes);
console.log('productRoutes:', typeof productRoutes);
console.log('categoryRoutes:', typeof categoryRoutes);

dotenv.config();

const app = express();
app.set('trust proxy', 1); // Trust first proxy
const PORT = process.env.PORT || 3001;

// Inicializar Prisma
export const prisma = new PrismaClient({
  log: ['error', 'warn'],
});

// NUEVO: Middleware para cookies (DEBE ir antes de las rutas)
app.use(cookieParser());

// Configuración de seguridad básica
app.use(helmet({
  contentSecurityPolicy: false, // Simplificado para desarrollo
}));

// CORS actualizado para manejar cookies y subdominios
app.use(cors({
  origin: function (origin, callback) {
    // Permitir requests sin origin (apps móviles, Postman, etc.)
    if (!origin) return callback(null, true);
    
    // Lista de dominios permitidos
    const allowedOrigins = [
      'http://localhost:3000',
      'http://localhost:3001', 
      'http://192.168.68.108:3000',
      'https://beztshop.com',
      'https://www.beztshop.com'
    ];
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      console.error('CORS blocked origin:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 
    'Authorization', 
    'x-refresh-token',
    'x-requested-with'
  ],
  exposedHeaders: ['set-cookie'],
}));

// ========================================
// RATE LIMITING OPTIMIZADO PARA E-COMMERCE
// ========================================

// 1. NAVEGACIÓN GENERAL - MUY PERMISIVO
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 1000, // 1000 requests por 15min = 66 requests/min
  message: { 
    error: 'Demasiadas peticiones, intenta nuevamente en unos minutos',
    retryAfter: 15 * 60 
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Skip en desarrollo para testing
    return process.env.NODE_ENV === 'development';
  }
});

// 2. BÚSQUEDAS/FILTROS - MODERADO  
const searchLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutos
  max: 100, // 100 búsquedas por 5min = 20 búsquedas/min
  message: { 
    error: 'Demasiadas búsquedas, espera un momento',
    retryAfter: 5 * 60 
  },
  standardHeaders: true,
  legacyHeaders: false
});

// 3. AUTENTICACIÓN - ESTRICTO (solo para login/register)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10, // 10 intentos por 15min
  message: { 
    error: 'Demasiados intentos de login/registro desde esta IP. Intenta en 15 minutos.',
    retryAfter: 15 * 60
  },
  standardHeaders: true,
  legacyHeaders: false
});

// 4. CHECKOUT - MODERADO (compras)
const checkoutLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10 minutos  
  max: 20, // 20 intentos de checkout por 10min
  message: { 
    error: 'Demasiados intentos de compra, espera unos minutos',
    retryAfter: 10 * 60 
  },
  standardHeaders: true,
  legacyHeaders: false
});

// ✅ AGREGAR AQUÍ LA FUNCIÓN SMART LIMITER
// ========================================
// RATE LIMITING INTELIGENTE PARA IPs COMPARTIDAS
// ========================================
const createSmartLimiter = (maxPerIP: number, maxPerUser: number, windowMs: number) => {
  return rateLimit({
    windowMs,
    max: maxPerIP,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req: any) => {
      // Si el usuario está autenticado, usar combinación user+IP
      if (req.user && req.user.id) {
        // Usar ipKeyGenerator para manejar IPv6 correctamente
        const ipKey = ipKeyGenerator(req);
        return `user_${req.user.id}_${ipKey}`;
      }
      // Si no está autenticado, usar solo IP con el helper
      return ipKeyGenerator(req);
    },
    skip: (req: any) => {
      // No aplicar rate limiting a usuarios autenticados en desarrollo
      if (process.env.NODE_ENV === 'development') {
        return true;
      }
      return false;
    }
  });
};

// Crear limiters inteligentes específicos
const smartAuthLimiter = createSmartLimiter(10, 5, 15 * 60 * 1000); // 10 por IP, 5 por usuario, 15min
const smartCheckoutLimiter = createSmartLimiter(20, 10, 10 * 60 * 1000); // 20 por IP, 10 por usuario, 10min

app.use(generalLimiter);
app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('combined'));
app.use(requestLogger);
app.use('/api/auth/login', smartAuthLimiter);
app.use('/api/auth/register', smartAuthLimiter);
app.use('/api/checkout', smartCheckoutLimiter);
app.use('/api/images', imageRoutes);




// Headers adicionales de seguridad para producción
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  }
  next();
});

// Health check mejorado
app.get('/api/health', async (req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    
    res.json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      database: 'connected',
      environment: process.env.NODE_ENV || 'development',
      version: '1.0.0'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'ERROR',
      database: 'disconnected',
      error: 'Database connection failed'
    });
  }
});

// Debug antes de registrar rutas
console.log('Registrando rutas...');

// Configurar rutas principales
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/wishlist', wishlistRoutes);
app.use('/api/checkout', checkoutRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api/newsletter', newsletterRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/mercadolibre', mercadolibreRoutes);


// Debug después de registrar
console.log('Rutas registradas exitosamente');

// Rutas básicas temporales
app.get('/api/test', (req, res) => {
  res.json({ 
    message: 'API funcionando correctamente',
    timestamp: new Date().toISOString(),
    cookies: req.cookies ? Object.keys(req.cookies) : []
  });
});

// Ruta protegida de prueba
app.get('/api/protected', authenticateToken, (req, res) => {
  res.json({ 
    message: 'Acceso autorizado',
    user: (req as any).user,
    timestamp: new Date().toISOString()
  });
});

// NUEVO: Tarea de limpieza de tokens expirados (ejecutar cada hora)
const startCleanupScheduler = () => {
  // Ejecutar inmediatamente al inicio
  cleanupExpiredTokens();
  
  // Ejecutar cada hora
  setInterval(() => {
    cleanupExpiredTokens();
  }, 60 * 60 * 1000);
  
  console.log('Token cleanup scheduler iniciado');
};

// Manejo de errores
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ 
    error: 'Endpoint no encontrado',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Graceful shutdown mejorado
const shutdown = async (signal: string) => {
  console.log(`${signal} recibido, cerrando servidor...`);
  
  try {
    await prisma.$disconnect();
    console.log('Base de datos desconectada exitosamente');
    process.exit(0);
  } catch (error) {
    console.error('Error durante shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Manejar errores no capturados
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  shutdown('UNCAUGHT_EXCEPTION');
});

// Iniciar servidor
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🔒 Ambiente: ${process.env.NODE_ENV || 'development'}`);
    console.log(`🍪 Cookies habilitadas: Sí`);
    
    // Iniciar limpieza de tokens
    startCleanupScheduler();
  });
}

export default app;