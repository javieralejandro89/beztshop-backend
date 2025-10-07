// src/controllers/authController.ts - Controlador actualizado con refresh tokens
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { emailService } from '../services/emailService';
import { forgotPasswordTemplate } from '../templates/emailTemplates';
import jwt from 'jsonwebtoken';
import { 
  hashPassword, 
  verifyPassword, 
  generateTokens,
  saveRefreshToken,
  invalidateRefreshToken,
  invalidateAllUserSessions
} from '../middleware/auth';
import { AuthenticatedRequest } from '../middleware/auth';

const prisma = new PrismaClient();

// Schemas de validación
const registerSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Contraseña debe tener al menos 8 caracteres'),
  firstName: z.string().min(1, 'Nombre es requerido').max(50),
  lastName: z.string().min(1, 'Apellido es requerido').max(50),
  phone: z.string().optional()
});

const loginSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(1, 'Contraseña es requerida')
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Contraseña actual es requerida'),
  newPassword: z.string().min(8, 'Nueva contraseña debe tener al menos 8 caracteres')
});

const forgotPasswordSchema = z.object({
  email: z.string().email('Email inválido')
});

const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token es requerido'),
  newPassword: z.string().min(8, 'Nueva contraseña debe tener al menos 8 caracteres')
});

// Función para configurar cookies de refresh token
const setRefreshTokenCookie = (res: Response, refreshToken: string) => {
  const isProduction = process.env.NODE_ENV === 'production';
  const expireDays = parseInt(process.env.JWT_REFRESH_EXPIRE?.replace('d', '') || '7');
  
  res.cookie('refreshToken', refreshToken, {
    httpOnly: true, // No accesible desde JavaScript
    secure: isProduction, // Solo HTTPS en producción
    sameSite: isProduction ? 'strict' : 'lax',
    maxAge: expireDays * 24 * 60 * 60 * 1000, // Convertir días a milisegundos
    path: '/', // Disponible en toda la app
    domain: isProduction ? '.serviprogarcia.com' : undefined // Punto inicial permite subdominios
  });
};

// Función para limpiar cookie de refresh token
const clearRefreshTokenCookie = (res: Response) => {
  res.clearCookie('refreshToken', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
    path: '/',
    domain: process.env.NODE_ENV === 'production' ? '.serviprogarcia.com' : undefined
  });
};

// Registro de usuario
export const register = async (req: Request, res: Response) => {
  try {
    const validation = registerSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const { email, password, firstName, lastName, phone } = validation.data;

    // Verificar si el usuario ya existe
    const existingUser = await prisma.user.findUnique({
      where: { email }
    });

    if (existingUser) {
      return res.status(409).json({
        error: 'Este email ya está registrado',
        code: 'EMAIL_ALREADY_EXISTS'
      });
    }

    // Crear hash de la contraseña
    const hashedPassword = await hashPassword(password);

    // Crear usuario
    const user = await prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        firstName,
        lastName,
        phone,
        role: 'CLIENT',
        userLevel: 'REGULAR',
        isActive: true
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        userLevel: true,
        createdAt: true
      }
    });

    // Generar tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Guardar refresh token en BD
    await saveRefreshToken(user.id, refreshToken);

    // Configurar cookie de refresh token
    setRefreshTokenCookie(res, refreshToken);

    console.log(`Usuario registrado: ${user.email}`);

    res.status(201).json({
      message: 'Usuario registrado exitosamente',
      user,
      accessToken,
      tokenInfo: {
        accessTokenExpiresIn: process.env.JWT_EXPIRE || '15m',
        refreshTokenExpiresIn: process.env.JWT_REFRESH_EXPIRE || '7d'
      }
    });

  } catch (error) {
    console.error('Error en registro:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Login de usuario
export const login = async (req: Request, res: Response) => {
  try {
    const validation = loginSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const { email, password } = validation.data;

    // Buscar usuario
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        password: true,
        firstName: true,
        lastName: true,
        role: true,
        userLevel: true,
        isActive: true,
        createdAt: true
      }
    });

    if (!user) {
      return res.status(401).json({
        error: 'Credenciales inválidas',
        code: 'INVALID_CREDENTIALS'
      });
    }

    if (!user.isActive) {
      return res.status(401).json({
        error: 'Cuenta desactivada',
        code: 'ACCOUNT_DISABLED'
      });
    }

    // Verificar contraseña
    const isPasswordValid = await verifyPassword(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        error: 'Credenciales inválidas',
        code: 'INVALID_CREDENTIALS'
      });
    }

    // Actualizar última conexión
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() }
    });

    // Generar tokens
    const { accessToken, refreshToken } = generateTokens(user);

    // Guardar refresh token en BD
    await saveRefreshToken(user.id, refreshToken);

    // Configurar cookie de refresh token
    setRefreshTokenCookie(res, refreshToken);

    // Remover password de la respuesta
    const { password: _, ...userWithoutPassword } = user;

    console.log(`Usuario logueado: ${user.email}`);

    res.json({
      message: 'Login exitoso',
      user: userWithoutPassword,
      accessToken,
      tokenInfo: {
        accessTokenExpiresIn: process.env.JWT_EXPIRE || '15m',
        refreshTokenExpiresIn: process.env.JWT_REFRESH_EXPIRE || '7d'
      }
    });

  } catch (error) {
    console.error('Error en login:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// NUEVO: Renovar access token usando refresh token
export const refreshToken = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!; // Ya validado por middleware
    const oldRefreshToken = req.refreshToken!;

    // Generar nuevos tokens
    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

    // Invalidar el refresh token anterior
    await invalidateRefreshToken(oldRefreshToken);

    // Guardar nuevo refresh token
    await saveRefreshToken(user.id, newRefreshToken);

    // Configurar nueva cookie
    setRefreshTokenCookie(res, newRefreshToken);

    console.log(`Tokens renovados para usuario: ${user.email}`);

    res.json({
      message: 'Tokens renovados exitosamente',
      user,
      accessToken,
      tokenInfo: {
        accessTokenExpiresIn: process.env.JWT_EXPIRE || '15m',
        refreshTokenExpiresIn: process.env.JWT_REFRESH_EXPIRE || '7d'
      }
    });

  } catch (error) {
    console.error('Error renovando tokens:', error);
    res.status(500).json({ 
      error: 'Error al renovar tokens',
      code: 'REFRESH_TOKEN_ERROR',
      requiresLogin: true
    });
  }
};

// Logout (invalidar refresh token)
export const logout = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    
    // ✅ MANEJO SEGURO DEL REFRESH TOKEN
    let refreshToken = null;
    
    // Intentar obtener de cookies primero
    if (req.cookies && req.cookies.refreshToken) {
      refreshToken = req.cookies.refreshToken;
    }
    // Si no está en cookies, buscar en body
    else if (req.body && req.body.refreshToken) {
      refreshToken = req.body.refreshToken;
    }
    // Si no está en ningún lado, buscar en headers
    else if (req.headers['x-refresh-token']) {
      refreshToken = req.headers['x-refresh-token'];
    }

    console.log('Logout attempt:', { userId, hasRefreshToken: !!refreshToken });

    // ✅ LÓGICA MEJORADA DE LOGOUT
    if (refreshToken) {
      try {
        // Invalidar el refresh token específico
        await invalidateRefreshToken(refreshToken);
        console.log(`Refresh token invalidated for user: ${userId}`);
      } catch (error) {
        console.error('Error invalidating refresh token:', error);
        // Continuar con logout aunque falle
      }
    } 
    
    if (userId) {
      try {
        // Siempre intentar limpiar sesiones del usuario como backup
        await invalidateAllUserSessions(userId);
        console.log(`All sessions invalidated for user: ${userId}`);
      } catch (error) {
        console.error('Error invalidating all sessions:', error);
        // Continuar con logout aunque falle
      }
    }

    // Limpiar cookie
    clearRefreshTokenCookie(res);

    console.log(`Logout exitoso para usuario: ${req.user?.email || 'unknown'}`);

    res.json({
      message: 'Logout exitoso'
    });

  } catch (error) {
    console.error('Error en logout:', error);
    // Incluso con error, limpiar cookie
    clearRefreshTokenCookie(res);
    res.status(200).json({
      message: 'Logout realizado (con errores menores)'
    });
  }
};

// NUEVO: Logout de todos los dispositivos
export const logoutAllDevices = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: 'No autenticado',
        code: 'NOT_AUTHENTICATED'
      });
    }

    // Invalidar todas las sesiones del usuario
    await invalidateAllUserSessions(userId);

    // Limpiar cookie actual
    clearRefreshTokenCookie(res);

    console.log(`Logout de todos los dispositivos para usuario: ${req.user?.email}`);

    res.json({
      message: 'Sesiones cerradas en todos los dispositivos'
    });

  } catch (error) {
    console.error('Error en logout all devices:', error);
    clearRefreshTokenCookie(res);
    res.status(500).json({ 
      error: 'Error al cerrar sesiones',
      code: 'LOGOUT_ALL_ERROR'
    });
  }
};

// Obtener perfil del usuario autenticado
export const getProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        userLevel: true,
        isActive: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true
      }
    });

    if (!user) {
      return res.status(404).json({
        error: 'Usuario no encontrado',
        code: 'USER_NOT_FOUND'
      });
    }

    res.json({ user });

  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Actualizar perfil
export const updateProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    
    const updateSchema = z.object({
      firstName: z.string().min(1).max(50).optional(),
      lastName: z.string().min(1).max(50).optional(),
      phone: z.string().optional()
    });

    const validation = updateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: validation.data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        userLevel: true,
        updatedAt: true
      }
    });

    res.json({
      message: 'Perfil actualizado exitosamente',
      user: updatedUser
    });

  } catch (error) {
    console.error('Error actualizando perfil:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Cambiar contraseña
export const changePassword = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    
    const validation = changePasswordSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const { currentPassword, newPassword } = validation.data;

    // Obtener usuario con contraseña actual
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { password: true }
    });

    if (!user) {
      return res.status(404).json({
        error: 'Usuario no encontrado',
        code: 'USER_NOT_FOUND'
      });
    }

    // Verificar contraseña actual
    const isCurrentPasswordValid = await verifyPassword(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({
        error: 'Contraseña actual incorrecta',
        code: 'CURRENT_PASSWORD_INVALID'
      });
    }

    // Hash de la nueva contraseña
    const hashedNewPassword = await hashPassword(newPassword);

    // Actualizar contraseña
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedNewPassword }
    });

    // Por seguridad, invalidar todas las sesiones excepto la actual
    await invalidateAllUserSessions(userId!);
    
    // Limpiar cookie actual también (forzar re-login)
    clearRefreshTokenCookie(res);
    
    console.log(`Contraseña cambiada para usuario: ${userId}`);

    res.json({
      message: 'Contraseña actualizada exitosamente. Debes iniciar sesión nuevamente.',
      requiresLogin: true
    });

  } catch (error) {
    console.error('Error cambiando contraseña:', error);
    res.status(500).json({ 
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Enviar email de recuperación de contraseña
export const forgotPassword = async (req: Request, res: Response) => {
  try {
    const validation = forgotPasswordSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const { email } = validation.data;

    // Buscar usuario
    const user = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        isActive: true
      }
    });

    // Siempre responder success por seguridad (no revelar si email existe)
    if (!user || !user.isActive) {
      return res.json({
        message: 'Si el email existe, recibirás un enlace de recuperación'
      });
    }

    // Generar token de reset (válido por 1 hora)
    const resetToken = jwt.sign(
      { userId: user.id, type: 'password-reset' },
      process.env.JWT_SECRET!,
      { expiresIn: '1h' }
    );

    // Crear enlace de reset
    const resetLink = `${process.env.FRONTEND_URL}/auth/reset-password?token=${resetToken}`;

    // Enviar email
    try {
      await emailService.sendEmail({
        to: user.email,
        subject: 'Recuperar Contraseña - ServiPro Garcia',
        html: forgotPasswordTemplate({
          customerName: `${user.firstName} ${user.lastName}`,
          resetLink,
          expiresIn: '1 hora'
        })
      });

      console.log(`Email de recuperación enviado a: ${user.email}`);
    } catch (emailError) {
      console.error('Error enviando email de recuperación:', emailError);
      return res.status(500).json({
        error: 'Error al enviar email de recuperación'
      });
    }

    res.json({
      message: 'Si el email existe, recibirás un enlace de recuperación'
    });

  } catch (error) {
    console.error('Error en forgot password:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
};

// Restablecer contraseña con token
export const resetPassword = async (req: Request, res: Response) => {
  try {
    const validation = resetPasswordSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const { token, newPassword } = validation.data;

    // Verificar token
    let decoded;
    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET!) as any;
      if (decoded.type !== 'password-reset') {
        throw new Error('Token inválido');
      }
    } catch (error) {
      return res.status(400).json({
        error: 'Token inválido o expirado'
      });
    }

    // Verificar que el usuario existe
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, isActive: true }
    });

    if (!user || !user.isActive) {
      return res.status(400).json({
        error: 'Usuario no encontrado'
      });
    }

    // Hash de la nueva contraseña
    const hashedPassword = await hashPassword(newPassword);

    // Actualizar contraseña
    await prisma.user.update({
      where: { id: user.id },
      data: { password: hashedPassword }
    });

    // Invalidar todas las sesiones por seguridad
    await invalidateAllUserSessions(user.id);

    console.log(`Contraseña restablecida para usuario: ${user.email}`);

    res.json({
      message: 'Contraseña restablecida exitosamente'
    });

  } catch (error) {
    console.error('Error en reset password:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
};

// Verificar token (para validar sesiones)
export const verifyToken = async (req: AuthenticatedRequest, res: Response) => {
  // Si llegamos aquí, significa que el token es válido (pasó por el middleware)
  res.json({
    valid: true,
    user: req.user,
    tokenInfo: {
      accessTokenExpiresIn: process.env.JWT_EXPIRE || '15m',
      refreshTokenExpiresIn: process.env.JWT_REFRESH_EXPIRE || '7d'
    }
  });
};