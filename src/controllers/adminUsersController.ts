// src/controllers/adminUsersController.ts - Controlador para gestión de usuarios por admin
import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { hashPassword } from '../middleware/auth';
import { AuthenticatedRequest } from '../middleware/auth';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';

const prisma = new PrismaClient();

// Schemas de validación
const createUserSchema = z.object({
  email: z.string().email('Email inválido'),
  password: z.string().min(8, 'Contraseña debe tener al menos 8 caracteres'),
  firstName: z.string().min(1, 'Nombre es requerido').max(50),
  lastName: z.string().min(1, 'Apellido es requerido').max(50),
  phone: z.string().optional(),
  role: z.enum(['ADMIN', 'CLIENT']).default('CLIENT'),
  userLevel: z.enum(['REGULAR', 'VIP', 'WHOLESALE']).default('REGULAR'),
  isActive: z.boolean().default(true)
});

const updateUserSchema = z.object({
  email: z.string().email('Email inválido').optional(),
  password: z.string().min(8, 'Contraseña debe tener al menos 8 caracteres').optional(),
  firstName: z.string().min(1, 'Nombre es requerido').max(50).optional(),
  lastName: z.string().min(1, 'Apellido es requerido').max(50).optional(),
  phone: z.string().optional(),
  role: z.enum(['ADMIN', 'CLIENT']).optional(),
  userLevel: z.enum(['REGULAR', 'VIP', 'WHOLESALE']).optional(),
  isActive: z.boolean().optional()
});

// Obtener lista de usuarios con filtros y paginación
export const getUsers = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Verificar que el usuario sea admin
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Acceso denegado',
        code: 'ACCESS_DENIED'
      });
    }

    const {
      page = '1',
      limit = '10',
      search = '',
      role = '',
      userLevel = '',
      isActive = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // AGREGAR validación de search
const searchTerm = Array.isArray(search) ? search[0] : search;
const trimmedSearch = typeof searchTerm === 'string' ? searchTerm.trim() : '';


    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Construir filtros
    const where: any = {};

if (trimmedSearch && trimmedSearch.length > 0) {
  where.OR = [
    { 
      email: { 
        contains: trimmedSearch,
        mode: 'insensitive' 
      } 
    },
    { 
      firstName: { 
        contains: trimmedSearch,
        mode: 'insensitive' 
      } 
    },
    { 
      lastName: { 
        contains: trimmedSearch,
        mode: 'insensitive' 
      } 
    }
  ];
}

    if (role) {
      where.role = role;
    }

    if (userLevel) {
      where.userLevel = userLevel;
    }

    if (isActive !== '') {
      where.isActive = isActive === 'true';
    }

    // Obtener usuarios
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
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
          updatedAt: true,
          _count: {
            select: {
              orders: true
            }
          }
        },
        orderBy: {
          [sortBy as string]: sortOrder as 'asc' | 'desc'
        },
        skip,
        take: limitNum
      }),
      prisma.user.count({ where })
    ]);

    const pages = Math.ceil(total / limitNum);
    const hasNext = pageNum < pages;
    const hasPrev = pageNum > 1;

    res.json({
      users,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages,
        hasNext,
        hasPrev
      }
    });

  } catch (error: any) {
  console.error('Error getting users:', error);
  console.error('Query que causó el error:', req.query); // Debug adicional
  
  res.status(500).json({
    error: 'Error interno del servidor',
    code: 'INTERNAL_SERVER_ERROR',
    details: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
}
};

// Obtener usuario por ID
export const getUserById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Verificar que el usuario sea admin
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Acceso denegado',
        code: 'ACCESS_DENIED'
      });
    }

    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
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
        updatedAt: true,
        _count: {
          select: {
            orders: true,
            addresses: true,
            paymentMethods: true,
            wishlistItems: true
          }
        }
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
    console.error('Error getting user by ID:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Crear nuevo usuario
export const createUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Verificar que el usuario sea admin
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Acceso denegado',
        code: 'ACCESS_DENIED'
      });
    }

    const validation = createUserSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const { email, password, firstName, lastName, phone, role, userLevel, isActive } = validation.data;

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
        role,
        userLevel,
        isActive
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        userLevel: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    console.log(`Usuario creado por admin: ${user.email} (creado por: ${req.user?.email})`);

    res.status(201).json({
      message: 'Usuario creado exitosamente',
      user
    });

  } catch (error) {
    console.error('Error creating user:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Actualizar usuario
export const updateUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Verificar que el usuario sea admin
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Acceso denegado',
        code: 'ACCESS_DENIED'
      });
    }

    const { id } = req.params;
    const validation = updateUserSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const updateData = validation.data;

    // Verificar que el usuario existe
    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true }
    });

    if (!existingUser) {
      return res.status(404).json({
        error: 'Usuario no encontrado',
        code: 'USER_NOT_FOUND'
      });
    }

    // Si se actualiza el email, verificar que no exista
    if (updateData.email && updateData.email !== existingUser.email) {
      const emailExists = await prisma.user.findUnique({
        where: { email: updateData.email }
      });

      if (emailExists) {
        return res.status(409).json({
          error: 'Este email ya está registrado',
          code: 'EMAIL_ALREADY_EXISTS'
        });
      }
    }

    // Si se actualiza la contraseña, crear hash
    const finalUpdateData: any = { ...updateData };
    if (updateData.password) {
      finalUpdateData.password = await hashPassword(updateData.password);
    }

    // Actualizar usuario
    const updatedUser = await prisma.user.update({
      where: { id },
      data: finalUpdateData,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        userLevel: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });

    console.log(`Usuario actualizado por admin: ${updatedUser.email} (actualizado por: ${req.user?.email})`);

    res.json({
      message: 'Usuario actualizado exitosamente',
      user: updatedUser
    });

  } catch (error) {
    console.error('Error updating user:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Eliminar usuario
export const deleteUser = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Verificar que el usuario sea admin
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Acceso denegado',
        code: 'ACCESS_DENIED'
      });
    }

    const { id } = req.params;

    // No permitir que el admin se elimine a sí mismo
    if (req.user?.id === id) {
      return res.status(400).json({
        error: 'No puedes eliminar tu propia cuenta',
        code: 'CANNOT_DELETE_SELF'
      });
    }

    // Verificar que el usuario existe
    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, role: true }
    });

    if (!existingUser) {
      return res.status(404).json({
        error: 'Usuario no encontrado',
        code: 'USER_NOT_FOUND'
      });
    }

    // Eliminar usuario (las relaciones se eliminan en cascada)
    await prisma.user.delete({
      where: { id }
    });

    console.log(`Usuario eliminado por admin: ${existingUser.email} (eliminado por: ${req.user?.email})`);

    res.json({
      message: 'Usuario eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error deleting user:', error);
    
    // Error de integridad referencial
    if (error instanceof PrismaClientKnownRequestError) {
      if (error.code === 'P2003') {
        return res.status(409).json({
          error: 'No se puede eliminar el usuario porque tiene pedidos asociados',
          code: 'USER_HAS_ORDERS'
        });
      }
    }

    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Cambiar estado del usuario (activar/desactivar)
export const toggleUserStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Verificar que el usuario sea admin
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Acceso denegado',
        code: 'ACCESS_DENIED'
      });
    }

    const { id } = req.params;

    // No permitir que el admin se desactive a sí mismo
    if (req.user?.id === id) {
      return res.status(400).json({
        error: 'No puedes desactivar tu propia cuenta',
        code: 'CANNOT_DEACTIVATE_SELF'
      });
    }

    // Obtener usuario actual
    const existingUser = await prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, isActive: true }
    });

    if (!existingUser) {
      return res.status(404).json({
        error: 'Usuario no encontrado',
        code: 'USER_NOT_FOUND'
      });
    }

    // Cambiar estado
    const updatedUser = await prisma.user.update({
      where: { id },
      data: { isActive: !existingUser.isActive },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phone: true,
        role: true,
        userLevel: true,
        isActive: true,
        updatedAt: true
      }
    });

    console.log(`Estado de usuario cambiado por admin: ${updatedUser.email} -> ${updatedUser.isActive ? 'activo' : 'inactivo'} (por: ${req.user?.email})`);

    res.json({
      message: `Usuario ${updatedUser.isActive ? 'activado' : 'desactivado'} exitosamente`,
      user: updatedUser
    });

  } catch (error) {
    console.error('Error toggling user status:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Obtener estadísticas de usuarios
export const getUserStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Verificar que el usuario sea admin
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Acceso denegado',
        code: 'ACCESS_DENIED'
      });
    }

    const stats = await prisma.user.groupBy({
      by: ['role', 'userLevel', 'isActive'],
      _count: {
        id: true
      }
    });

    const totalUsers = await prisma.user.count();
    const newUsersThisMonth = await prisma.user.count({
      where: {
        createdAt: {
          gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
        }
      }
    });

    const activeUsers = await prisma.user.count({
      where: { isActive: true }
    });

    res.json({
      stats: {
        total: totalUsers,
        active: activeUsers,
        inactive: totalUsers - activeUsers,
        newThisMonth: newUsersThisMonth,
        byRole: stats.filter(s => s.role).reduce((acc, curr) => {
          acc[curr.role] = curr._count.id;
          return acc;
        }, {} as Record<string, number>),
        byLevel: stats.filter(s => s.userLevel).reduce((acc, curr) => {
          acc[curr.userLevel] = curr._count.id;
          return acc;
        }, {} as Record<string, number>)
      }
    });

  } catch (error) {
    console.error('Error getting user stats:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};