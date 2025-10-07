// src/controllers/adminCouponsController.ts - Controlador para gestión de cupones
import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';

const prisma = new PrismaClient();

// Schemas de validación
const createCouponSchema = z.object({
  code: z.string().min(3, 'Código debe tener al menos 3 caracteres').max(20).toUpperCase(),
  type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING']),
  value: z.number().min(0, 'El valor debe ser positivo'),
  minAmount: z.number().min(0).optional(),
  maxDiscount: z.number().min(0).optional(),
  usageLimit: z.number().int().min(1).optional(),
  isActive: z.boolean().default(true),
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional()
});

const updateCouponSchema = createCouponSchema.partial().extend({
  code: z.string().min(3).max(20).toUpperCase().optional()
});

// Función auxiliar para verificar permisos de admin
const verifyAdminAccess = (req: AuthenticatedRequest, res: Response): boolean => {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({
      error: 'Acceso denegado',
      code: 'ACCESS_DENIED'
    });
    return false;
  }
  return true;
};

// Obtener lista de cupones con filtros y paginación
export const getCoupons = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!verifyAdminAccess(req, res)) return;

    const {
      page = '1',
      limit = '10',
      search = '',
      type = '',
      isActive = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Construir filtros
    const where: any = {};

    if (search) {
      where.code = {
        contains: search,
        mode: 'insensitive'
      };
    }

    if (type) {
      where.type = type;
    }

    if (isActive !== '') {
      where.isActive = isActive === 'true';
    }

    // Obtener cupones
    const [coupons, total] = await Promise.all([
      prisma.coupon.findMany({
        where,
        orderBy: {
          [sortBy as string]: sortOrder as 'asc' | 'desc'
        },
        skip,
        take: limitNum
      }),
      prisma.coupon.count({ where })
    ]);

    const pages = Math.ceil(total / limitNum);
    const hasNext = pageNum < pages;
    const hasPrev = pageNum > 1;

    res.json({
      coupons,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages,
        hasNext,
        hasPrev
      }
    });

  } catch (error) {
    console.error('Error getting coupons:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Obtener cupón por ID
export const getCouponById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!verifyAdminAccess(req, res)) return;

    const { id } = req.params;

    const coupon = await prisma.coupon.findUnique({
      where: { id }
    });

    if (!coupon) {
      return res.status(404).json({
        error: 'Cupón no encontrado',
        code: 'COUPON_NOT_FOUND'
      });
    }

    res.json({ coupon });

  } catch (error) {
    console.error('Error getting coupon by ID:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Crear nuevo cupón
export const createCoupon = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!verifyAdminAccess(req, res)) return;

    const validation = createCouponSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const { code, type, value, minAmount, maxDiscount, usageLimit, isActive, startsAt, expiresAt } = validation.data;

    // Verificar si el código ya existe
    const existingCoupon = await prisma.coupon.findUnique({
      where: { code }
    });

    if (existingCoupon) {
      return res.status(409).json({
        error: 'Este código de cupón ya existe',
        code: 'COUPON_CODE_EXISTS'
      });
    }

    // Validaciones específicas según el tipo
    if (type === 'PERCENTAGE' && value > 100) {
      return res.status(400).json({
        error: 'El porcentaje no puede ser mayor a 100%',
        code: 'INVALID_PERCENTAGE'
      });
    }

    if (type === 'FREE_SHIPPING' && value !== 0) {
      // Para envío gratis, el valor debe ser 0
      validation.data.value = 0;
    }

    // Validar fechas
    if (startsAt && expiresAt) {
      const startDate = new Date(startsAt);
      const endDate = new Date(expiresAt);
      
      if (startDate >= endDate) {
        return res.status(400).json({
          error: 'La fecha de expiración debe ser posterior a la fecha de inicio',
          code: 'INVALID_DATE_RANGE'
        });
      }
    }

    // Crear cupón
    const coupon = await prisma.coupon.create({
      data: {
        code,
        type,
        value,
        minAmount,
        maxDiscount,
        usageLimit,
        usageCount: 0,
        isActive,
        startsAt: startsAt ? new Date(startsAt) : null,
        expiresAt: expiresAt ? new Date(expiresAt) : null
      }
    });

    console.log(`Cupón creado por admin: ${code} (${type}) - ${req.user?.email}`);

    res.status(201).json({
      message: 'Cupón creado exitosamente',
      coupon
    });

  } catch (error) {
    console.error('Error creating coupon:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Actualizar cupón
export const updateCoupon = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!verifyAdminAccess(req, res)) return;

    const { id } = req.params;
    const validation = updateCouponSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const updateData = validation.data;

    // Verificar que el cupón existe
    const existingCoupon = await prisma.coupon.findUnique({
      where: { id }
    });

    if (!existingCoupon) {
      return res.status(404).json({
        error: 'Cupón no encontrado',
        code: 'COUPON_NOT_FOUND'
      });
    }

    // Si se actualiza el código, verificar que no exista
    if (updateData.code && updateData.code !== existingCoupon.code) {
      const codeExists = await prisma.coupon.findUnique({
        where: { code: updateData.code }
      });

      if (codeExists) {
        return res.status(409).json({
          error: 'Este código de cupón ya existe',
          code: 'COUPON_CODE_EXISTS'
        });
      }
    }

    // Validaciones específicas según el tipo
    if (updateData.type === 'PERCENTAGE' && updateData.value && updateData.value > 100) {
      return res.status(400).json({
        error: 'El porcentaje no puede ser mayor a 100%',
        code: 'INVALID_PERCENTAGE'
      });
    }

    if (updateData.type === 'FREE_SHIPPING') {
      updateData.value = 0;
    }

    // Validar fechas si se proporcionan
    if (updateData.startsAt && updateData.expiresAt) {
      const startDate = new Date(updateData.startsAt);
      const endDate = new Date(updateData.expiresAt);
      
      if (startDate >= endDate) {
        return res.status(400).json({
          error: 'La fecha de expiración debe ser posterior a la fecha de inicio',
          code: 'INVALID_DATE_RANGE'
        });
      }
    }

    // Preparar datos de actualización
    const finalUpdateData: any = { ...updateData };
    if (updateData.startsAt) {
      finalUpdateData.startsAt = new Date(updateData.startsAt);
    }
    if (updateData.expiresAt) {
      finalUpdateData.expiresAt = new Date(updateData.expiresAt);
    }

    // Actualizar cupón
    const updatedCoupon = await prisma.coupon.update({
      where: { id },
      data: finalUpdateData
    });

    console.log(`Cupón actualizado por admin: ${updatedCoupon.code} - ${req.user?.email}`);

    res.json({
      message: 'Cupón actualizado exitosamente',
      coupon: updatedCoupon
    });

  } catch (error) {
    console.error('Error updating coupon:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Eliminar cupón
export const deleteCoupon = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!verifyAdminAccess(req, res)) return;

    const { id } = req.params;

    // Verificar que el cupón existe
    const existingCoupon = await prisma.coupon.findUnique({
      where: { id },
      select: { id: true, code: true, usageCount: true }
    });

    if (!existingCoupon) {
      return res.status(404).json({
        error: 'Cupón no encontrado',
        code: 'COUPON_NOT_FOUND'
      });
    }

    // Verificar si el cupón ya fue usado
    if (existingCoupon.usageCount > 0) {
      return res.status(409).json({
        error: 'No se puede eliminar un cupón que ya fue usado',
        code: 'COUPON_ALREADY_USED'
      });
    }

    // Eliminar cupón
    await prisma.coupon.delete({
      where: { id }
    });

    console.log(`Cupón eliminado por admin: ${existingCoupon.code} - ${req.user?.email}`);

    res.json({
      message: 'Cupón eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error deleting coupon:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Cambiar estado del cupón (activar/desactivar)
export const toggleCouponStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!verifyAdminAccess(req, res)) return;

    const { id } = req.params;

    // Obtener cupón actual
    const existingCoupon = await prisma.coupon.findUnique({
      where: { id },
      select: { id: true, code: true, isActive: true }
    });

    if (!existingCoupon) {
      return res.status(404).json({
        error: 'Cupón no encontrado',
        code: 'COUPON_NOT_FOUND'
      });
    }

    // Cambiar estado
    const updatedCoupon = await prisma.coupon.update({
      where: { id },
      data: { isActive: !existingCoupon.isActive }
    });

    console.log(`Estado de cupón cambiado por admin: ${updatedCoupon.code} -> ${updatedCoupon.isActive ? 'activo' : 'inactivo'} - ${req.user?.email}`);

    res.json({
      message: `Cupón ${updatedCoupon.isActive ? 'activado' : 'desactivado'} exitosamente`,
      coupon: updatedCoupon
    });

  } catch (error) {
    console.error('Error toggling coupon status:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Validar cupón (para uso en el checkout)
export const validateCoupon = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code } = req.params;
    const { orderAmount } = req.query;

    if (!code) {
      return res.status(400).json({
        error: 'Código de cupón es requerido',
        code: 'COUPON_CODE_REQUIRED'
      });
    }

    const coupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase() }
    });

    if (!coupon) {
      return res.status(404).json({
        error: 'Cupón no encontrado',
        code: 'COUPON_NOT_FOUND',
        valid: false
      });
    }

    // Verificar si el cupón está activo
    if (!coupon.isActive) {
      return res.status(400).json({
        error: 'Este cupón no está activo',
        code: 'COUPON_INACTIVE',
        valid: false
      });
    }

    // Verificar fecha de inicio
    if (coupon.startsAt && coupon.startsAt > new Date()) {
      return res.status(400).json({
        error: 'Este cupón aún no está disponible',
        code: 'COUPON_NOT_STARTED',
        valid: false
      });
    }

    // Verificar fecha de expiración
    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      return res.status(400).json({
        error: 'Este cupón ha expirado',
        code: 'COUPON_EXPIRED',
        valid: false
      });
    }

    // Verificar límite de uso
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      return res.status(400).json({
        error: 'Este cupón ha alcanzado su límite de uso',
        code: 'COUPON_LIMIT_REACHED',
        valid: false
      });
    }

    // Verificar monto mínimo si se proporciona
    if (orderAmount && coupon.minAmount) {
      const amount = parseFloat(orderAmount as string);      
      if (amount < coupon.minAmount.toNumber()) {
        return res.status(400).json({
          error: `Monto mínimo requerido: $${coupon.minAmount.toNumber().toFixed(2)}`,
          code: 'MINIMUM_AMOUNT_NOT_REACHED',
          valid: false
        });
      }
    }

    // Calcular descuento
    let discount = 0;
    if (coupon.type === 'PERCENTAGE') {
      const amount = orderAmount ? parseFloat(orderAmount as string) : 0;
      discount = (amount * coupon.value.toNumber()) / 100;
      
      // Aplicar descuento máximo si está configurado
      if (coupon.maxDiscount && discount > coupon.maxDiscount.toNumber()) {
        discount = coupon.maxDiscount.toNumber();
      }
    } else if (coupon.type === 'FIXED_AMOUNT') {
      discount = coupon.value.toNumber();
    }
    // Para FREE_SHIPPING, el descuento se maneja diferente en el checkout

    res.json({
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        discount,
        minAmount: coupon.minAmount,
        maxDiscount: coupon.maxDiscount
      }
    });

  } catch (error) {
    console.error('Error validating coupon:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR',
      valid: false
    });
  }
};

// Aplicar cupón (incrementar contador de uso)
export const applyCoupon = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const updatedCoupon = await prisma.coupon.update({
      where: { id },
      data: {
        usageCount: {
          increment: 1
        }
      }
    });

    console.log(`Cupón aplicado: ${updatedCoupon.code} (uso #${updatedCoupon.usageCount})`);

    res.json({
      message: 'Cupón aplicado exitosamente',
      coupon: updatedCoupon
    });

  } catch (error) {
    console.error('Error applying coupon:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Obtener estadísticas de cupones
export const getCouponStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!verifyAdminAccess(req, res)) return;

    const [
      totalCoupons,
      activeCoupons,
      usedCoupons,
      expiredCoupons,
      mostUsedCoupons,
      typeStats
    ] = await Promise.all([
      prisma.coupon.count(),
      prisma.coupon.count({ where: { isActive: true } }),
      prisma.coupon.count({ where: { usageCount: { gt: 0 } } }),
      prisma.coupon.count({ 
        where: { 
          expiresAt: { lt: new Date() },
          isActive: true
        } 
      }),
      prisma.coupon.findMany({
        orderBy: { usageCount: 'desc' },
        take: 5,
        select: {
          code: true,
          type: true,
          value: true,
          usageCount: true,
          usageLimit: true
        }
      }),
      prisma.coupon.groupBy({
        by: ['type'],
        _count: { id: true },
        _sum: { usageCount: true }
      })
    ]);

    res.json({
      stats: {
        total: totalCoupons,
        active: activeCoupons,
        inactive: totalCoupons - activeCoupons,
        used: usedCoupons,
        expired: expiredCoupons,
        mostUsed: mostUsedCoupons,
        byType: typeStats.reduce((acc, curr) => {
          acc[curr.type] = {
            count: curr._count.id,
            totalUsage: curr._sum.usageCount || 0
          };
          return acc;
        }, {} as Record<string, { count: number; totalUsage: number }>)
      }
    });

  } catch (error) {
    console.error('Error getting coupon stats:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};