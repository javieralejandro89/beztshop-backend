// src/middleware/auth.ts - Sistema completo con Refresh Tokens
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
    userLevel: string;
  };
  refreshToken?: string;
}

export interface TokenPayload {
  id: string;
  email: string;
  role: string;
  userLevel: string;
  type?: 'access' | 'refresh';
}

// Generar tokens JWT (Access + Refresh)
export const generateTokens = (user: any) => {
  const payload: TokenPayload = {
    id: user.id,
    email: user.email,
    role: user.role,
    userLevel: user.userLevel,
  };

  // Access Token - vida corta (15-30 min)
  const accessToken = jwt.sign(
    { ...payload, type: 'access' },
    process.env.JWT_SECRET!,
    { 
      expiresIn: process.env.JWT_EXPIRE || '15m',
      issuer: 'servipro-garcia',
      audience: 'servipro-client'
    }
  );

  // Refresh Token - vida larga (7-30 días)
  const refreshToken = jwt.sign(
    { ...payload, type: 'refresh' },
    process.env.JWT_REFRESH_SECRET!,
    { 
      expiresIn: process.env.JWT_REFRESH_EXPIRE || '7d',
      issuer: 'servipro-garcia',
      audience: 'servipro-client'
    }
  );

  return { accessToken, refreshToken };
};

// Verificar Access Token
export const verifyAccessToken = (token: string): TokenPayload => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!, {
      issuer: 'servipro-garcia',
      audience: 'servipro-client'
    }) as jwt.JwtPayload;
    
    if (decoded.type !== 'access') {
      throw new Error('Token type invalid');
    }
    
    return decoded as TokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('ACCESS_TOKEN_EXPIRED');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('ACCESS_TOKEN_INVALID');
    } else {
      throw new Error('ACCESS_TOKEN_ERROR');
    }
  }
};

// Verificar Refresh Token
export const verifyRefreshToken = (token: string): TokenPayload => {
  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET!, {
      issuer: 'servipro-garcia',
      audience: 'servipro-client'
    }) as jwt.JwtPayload;
    
    if (decoded.type !== 'refresh') {
      throw new Error('Token type invalid');
    }
    
    return decoded as TokenPayload;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new Error('REFRESH_TOKEN_EXPIRED');
    } else if (error instanceof jwt.JsonWebTokenError) {
      throw new Error('REFRESH_TOKEN_INVALID');
    } else {
      throw new Error('REFRESH_TOKEN_ERROR');
    }
  }
};

// Middleware de autenticación principal
export const authenticateToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({ 
        error: 'Token de acceso requerido',
        code: 'TOKEN_REQUIRED'
      });
    }

    let decoded: TokenPayload;
    
    try {
      decoded = verifyAccessToken(token);
    } catch (error: any) {
      return res.status(401).json({ 
        error: error.message === 'ACCESS_TOKEN_EXPIRED' ? 'Token expirado' : 'Token inválido',
        code: error.message,
        needsRefresh: error.message === 'ACCESS_TOKEN_EXPIRED'
      });
    }

    // Verificar que el usuario existe y está activo
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        role: true,
        userLevel: true,
        isActive: true
      }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ 
        error: 'Usuario no encontrado o inactivo',
        code: 'USER_INACTIVE'
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      userLevel: user.userLevel
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(401).json({ 
      error: 'Error de autenticación',
      code: 'AUTH_ERROR'
    });
  }
};

// Middleware para refresh tokens
export const authenticateRefreshToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    // Buscar refresh token en cookies (preferido) o en body/headers
    let refreshToken = req.cookies?.refreshToken;
    
    if (!refreshToken && req.body.refreshToken) {
      refreshToken = req.body.refreshToken;
    }
    
    if (!refreshToken && req.headers['x-refresh-token']) {
      refreshToken = req.headers['x-refresh-token'];
    }

    if (!refreshToken) {
      return res.status(401).json({ 
        error: 'Refresh token requerido',
        code: 'REFRESH_TOKEN_REQUIRED'
      });
    }

    let decoded: TokenPayload;
    
    try {
      decoded = verifyRefreshToken(refreshToken as string);
    } catch (error: any) {
      return res.status(401).json({ 
        error: error.message === 'REFRESH_TOKEN_EXPIRED' ? 'Sesión expirada' : 'Refresh token inválido',
        code: error.message,
        requiresLogin: true
      });
    }

    // Verificar que el refresh token existe en la base de datos
    const storedSession = await prisma.userSession.findFirst({
      where: {
        userId: decoded.id,
        token: refreshToken as string,
        expiresAt: { gt: new Date() }
      }
    });

    if (!storedSession) {
      return res.status(401).json({ 
        error: 'Refresh token inválido o expirado',
        code: 'REFRESH_TOKEN_INVALID',
        requiresLogin: true
      });
    }

    // Verificar que el usuario existe y está activo
    const user = await prisma.user.findUnique({
      where: { id: decoded.id },
      select: {
        id: true,
        email: true,
        role: true,
        userLevel: true,
        isActive: true
      }
    });

    if (!user || !user.isActive) {
      return res.status(401).json({ 
        error: 'Usuario no encontrado o inactivo',
        code: 'USER_INACTIVE',
        requiresLogin: true
      });
    }

    req.user = {
      id: user.id,
      email: user.email,
      role: user.role,
      userLevel: user.userLevel
    };

    // Pasar el refresh token para poder renovar la sesión
    req.refreshToken = refreshToken as string;
    
    next();
  } catch (error) {
    console.error('Refresh token authentication error:', error);
    return res.status(401).json({ 
      error: 'Error de autenticación con refresh token',
      code: 'REFRESH_AUTH_ERROR',
      requiresLogin: true
    });
  }
};

// Middleware para verificar roles
export const requireRole = (roles: string[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ 
        error: 'No autenticado',
        code: 'NOT_AUTHENTICATED'
      });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ 
        error: 'Permisos insuficientes',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }

    next();
  };
};

// Guardar refresh token en la base de datos
export const saveRefreshToken = async (userId: string, refreshToken: string) => {
  // Calcular fecha de expiración (mover al nivel superior)
  const refreshExpiry = new Date();
  const expireDays = parseInt(process.env.JWT_REFRESH_EXPIRE?.replace('d', '') || '7');
  refreshExpiry.setDate(refreshExpiry.getDate() + expireDays);

  try {
    // PRIMERO: Limpiar tokens expirados del usuario
    await prisma.userSession.deleteMany({
      where: {
        userId,
        expiresAt: { lt: new Date() }
      }
    });

    // SEGUNDO: Eliminar cualquier token duplicado que pueda existir
    await prisma.userSession.deleteMany({
      where: {
        userId,
        token: refreshToken
      }
    });

    // TERCERO: Usar upsert para evitar conflictos de duplicados
    await prisma.userSession.upsert({
      where: {
        token: refreshToken
      },
      update: {
        expiresAt: refreshExpiry
      },
      create: {
        userId,
        token: refreshToken,
        expiresAt: refreshExpiry
      }
    });

  } catch (error) {
    console.error('Error saving refresh token:', error);
    
    // Si aún hay error, intentar con un enfoque más simple
    try {
      // Eliminar TODOS los tokens del usuario y crear uno nuevo
      await prisma.userSession.deleteMany({
        where: { userId }
      });
      
      await prisma.userSession.create({
        data: {
          userId,
          token: refreshToken,
          expiresAt: refreshExpiry
        }
      });
    } catch (fallbackError) {
      console.error('Fallback error saving refresh token:', fallbackError);
      throw new Error('Error al guardar token de sesión');
    }
  }
};

// Invalidar refresh token
export const invalidateRefreshToken = async (refreshToken: string) => {
  try {
    await prisma.userSession.deleteMany({
      where: { token: refreshToken }
    });
  } catch (error) {
    console.error('Error invalidating refresh token:', error);
    throw new Error('Error al invalidar token');
  }
};

// Invalidar todas las sesiones de un usuario
export const invalidateAllUserSessions = async (userId: string) => {
  try {
    await prisma.userSession.deleteMany({
      where: { userId }
    });
  } catch (error) {
    console.error('Error invalidating all user sessions:', error);
    throw new Error('Error al invalidar sesiones');
  }
};

// Hash de contraseñas
export const hashPassword = async (password: string): Promise<string> => {
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS || '12');
  return await bcrypt.hash(password, saltRounds);
};

// Verificar contraseña
export const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return await bcrypt.compare(password, hash);
};

// Limpiar tokens expirados (ejecutar periódicamente)
export const cleanupExpiredTokens = async () => {
  try {
    const result = await prisma.userSession.deleteMany({
      where: {
        expiresAt: { lt: new Date() }
      }
    });
    console.log(`Cleaned up ${result.count} expired tokens`);
  } catch (error) {
    console.error('Error cleaning up expired tokens:', error);
  }
};