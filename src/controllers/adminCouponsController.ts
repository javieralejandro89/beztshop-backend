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
  usageLimitPerUser: z.number().int().min(1).default(1), // 🆕 NUEVO
  
  // 🆕 NUEVO: Aplicabilidad
  applicationType: z.enum(['ALL_PRODUCTS', 'SPECIFIC_PRODUCTS', 'SPECIFIC_CATEGORIES', 'EXCLUDE_PRODUCTS']).default('ALL_PRODUCTS'),
  applicableProductIds: z.array(z.string()).optional(),
  applicableCategoryIds: z.array(z.string()).optional(),
  excludedProductIds: z.array(z.string()).optional(),
  
  isActive: z.boolean().default(true),
  isPublic: z.boolean().default(true), // 🆕 NUEVO
  description: z.string().max(500).optional(), // 🆕 NUEVO
  tags: z.string().optional(), // 🆕 NUEVO
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional()
});

const updateCouponSchema = z.object({
  code: z.string().min(3).max(20).toUpperCase().optional(),
  type: z.enum(['PERCENTAGE', 'FIXED_AMOUNT', 'FREE_SHIPPING']).optional(),
  value: z.number().min(0).optional(),
  minAmount: z.number().min(0).optional(),
  maxDiscount: z.number().min(0).optional(),
  usageLimit: z.number().int().min(1).optional(),
  usageLimitPerUser: z.number().int().min(1).optional(), // 🆕
  
  // 🆕 Aplicabilidad
  applicationType: z.enum(['ALL_PRODUCTS', 'SPECIFIC_PRODUCTS', 'SPECIFIC_CATEGORIES', 'EXCLUDE_PRODUCTS']).optional(),
  applicableProductIds: z.array(z.string()).optional(),
  applicableCategoryIds: z.array(z.string()).optional(),
  excludedProductIds: z.array(z.string()).optional(),
  
  isActive: z.boolean().optional(),
  isPublic: z.boolean().optional(), // 🆕
  description: z.string().max(500).optional(), // 🆕
  tags: z.string().optional(), // 🆕
  startsAt: z.string().datetime().optional(),
  expiresAt: z.string().datetime().optional()
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

    const { 
  code, 
  type, 
  value, 
  minAmount, 
  maxDiscount, 
  usageLimit, 
  usageLimitPerUser, // 🆕
  applicationType, // 🆕
  applicableProductIds, // 🆕
  applicableCategoryIds, // 🆕
  excludedProductIds, // 🆕
  isActive, 
  isPublic, // 🆕
  description, // 🆕
  tags, // 🆕
  startsAt, 
  expiresAt 
} = validation.data;

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
    usageLimitPerUser, // ✅ Sin "data."
    usageCount: 0,
    
    // 🆕 Aplicabilidad
    applicationType,
    applicableProductIds: applicableProductIds?.join(','),
    applicableCategoryIds: applicableCategoryIds?.join(','),
    excludedProductIds: excludedProductIds?.join(','),
    
    isActive,
    isPublic, // ✅ Sin "data."
    description, // ✅ Sin "data."
    tags, // ✅ Sin "data."
    createdBy: req.user?.id,
    startsAt: startsAt ? new Date(startsAt) : null,
    expiresAt: expiresAt ? new Date(expiresAt) : null
  }
});

    console.log(`Cupón creado por admin: ${code} (${type}) - ${req.user?.email}`);

    res.status(201).json({
      message: 'Cupón creado exitosamente',
      coupon: {
    ...coupon,
    // 🆕 Convertir strings de IDs a arrays para el frontend
    applicableProductIds: coupon.applicableProductIds?.split(',').filter(Boolean) || [],
    applicableCategoryIds: coupon.applicableCategoryIds?.split(',').filter(Boolean) || [],
    excludedProductIds: coupon.excludedProductIds?.split(',').filter(Boolean) || []
  }
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
    // Preparar datos de actualización
const finalUpdateData: any = { ...updateData };

// 🆕 Convertir arrays a strings (o null si están vacíos)
if (updateData.applicableProductIds !== undefined) {
  finalUpdateData.applicableProductIds = Array.isArray(updateData.applicableProductIds) && updateData.applicableProductIds.length > 0
    ? updateData.applicableProductIds.join(',')
    : null;
}

if (updateData.applicableCategoryIds !== undefined) {
  finalUpdateData.applicableCategoryIds = Array.isArray(updateData.applicableCategoryIds) && updateData.applicableCategoryIds.length > 0
    ? updateData.applicableCategoryIds.join(',')
    : null;
}

if (updateData.excludedProductIds !== undefined) {
  finalUpdateData.excludedProductIds = Array.isArray(updateData.excludedProductIds) && updateData.excludedProductIds.length > 0
    ? updateData.excludedProductIds.join(',')
    : null;
}

// Convertir fechas
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
      select: { 
        id: true, 
        code: true, 
        usageCount: true,
        _count: {
          select: {
            usages: true // 🆕 Contar registros en CouponUsage
          }
        }
      }
    });

    if (!existingCoupon) {
      return res.status(404).json({
        error: 'Cupón no encontrado',
        code: 'COUPON_NOT_FOUND'
      });
    }

    // 🆕 Verificar si hay órdenes asociadas (en lugar de solo usageCount)
    // Si tiene registros en CouponUsage con orderId, significa que se usó en órdenes reales
    const usagesWithOrders = await prisma.couponUsage.count({
      where: {
        couponId: id,
        orderId: { not: null }
      }
    });

    if (usagesWithOrders > 0) {
      return res.status(409).json({
        error: `No se puede eliminar un cupón que ya fue usado en ${usagesWithOrders} orden(es)`,
        code: 'COUPON_ALREADY_USED'
      });
    }

    // ✅ Si no tiene órdenes asociadas, se puede eliminar (aunque tenga usageCount > 0 de antes)
    // La cascada eliminará automáticamente los registros de CouponUsage
    await prisma.coupon.delete({
      where: { id }
    });

    console.log(`Cupón eliminado por admin: ${existingCoupon.code} - ${req.user?.email}`);

    res.json({
      message: 'Cupón eliminado exitosamente'
    });

  } catch (error: any) {
    console.error('Error deleting coupon:', error);
    
    // 🆕 Manejar error de integridad referencial si falla la cascada
    if (error.code === 'P2003' || error.code === 'P2014') {
      return res.status(409).json({
        error: 'No se puede eliminar el cupón porque tiene registros asociados',
        code: 'COUPON_HAS_DEPENDENCIES'
      });
    }
    
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

async function getApplicableProducts(
  coupon: any,
  requestedProductIds: string[]
): Promise<string[]> {
  
  if (coupon.applicationType === 'ALL_PRODUCTS') {
    return requestedProductIds;
  }
  
  if (coupon.applicationType === 'SPECIFIC_PRODUCTS') {
    const applicableIds = coupon.applicableProductIds?.split(',').filter(Boolean) || [];
    return requestedProductIds.filter(id => applicableIds.includes(id));
  }
  
  if (coupon.applicationType === 'SPECIFIC_CATEGORIES') {
    const categoryIds = coupon.applicableCategoryIds?.split(',').filter(Boolean) || [];
    
    const products = await prisma.product.findMany({
      where: {
        id: { in: requestedProductIds },
        categoryId: { in: categoryIds }
      },
      select: { id: true }
    });
    
    return products.map(p => p.id);
  }
  
  if (coupon.applicationType === 'EXCLUDE_PRODUCTS') {
    const excludedIds = coupon.excludedProductIds?.split(',').filter(Boolean) || [];
    return requestedProductIds.filter(id => !excludedIds.includes(id));
  }
  
  return [];
}

// 🆕 VALIDAR CUPÓN CON RESTRICCIONES POR USUARIO Y PRODUCTO
export const validateCouponAdvanced = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code } = req.params;
    const { orderAmount, productIds } = req.query;
    const userId = req.user?.id;

    if (!code) {
      return res.status(400).json({
        error: 'Código de cupón es requerido'
      });
    }

    if (!userId) {
      return res.status(401).json({
        error: 'Usuario no autenticado'
      });
    }

    const coupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        usages: {
          where: { userId },
          orderBy: { usedAt: 'desc' }
        }
      }
    });

    if (!coupon) {
      return res.status(404).json({
        error: 'Cupón no encontrado',
        valid: false
      });
    }

    if (!coupon.isActive) {
      return res.status(400).json({
        error: 'Este cupón no está activo',
        valid: false
      });
    }

    if (coupon.startsAt && coupon.startsAt > new Date()) {
      return res.status(400).json({
        error: 'Este cupón aún no está disponible',
        valid: false
      });
    }

    if (coupon.expiresAt && coupon.expiresAt < new Date()) {
      return res.status(400).json({
        error: 'Este cupón ha expirado',
        valid: false
      });
    }

    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      return res.status(400).json({
        error: 'Este cupón ha alcanzado su límite de uso',
        valid: false
      });
    }

    // 🆕 LÍMITE DE USOS POR USUARIO
    if (coupon.usageLimitPerUser) {
      const userUsageCount = coupon.usages.length;
      
      if (userUsageCount >= coupon.usageLimitPerUser) {
        return res.status(400).json({
          error: `Ya has usado este cupón el máximo de veces permitido (${coupon.usageLimitPerUser})`,
          code: 'USER_USAGE_LIMIT_REACHED',
          valid: false
        });
      }
    }

    if (orderAmount && coupon.minAmount) {
      const amount = parseFloat(orderAmount as string);
      if (amount < coupon.minAmount.toNumber()) {
        return res.status(400).json({
          error: `Monto mínimo requerido: $${coupon.minAmount.toNumber().toFixed(2)}`,
          valid: false
        });
      }
    }

    // 🆕 VALIDAR PRODUCTOS APLICABLES
    let applicableProducts: string[] = [];
    
    if (productIds) {
      const requestedProducts = Array.isArray(productIds) 
        ? productIds as string[] 
        : [productIds as string];
      
      applicableProducts = await getApplicableProducts(coupon, requestedProducts);
      
      if (applicableProducts.length === 0) {
        return res.status(400).json({
          error: 'Este cupón no aplica para los productos en tu carrito',
          code: 'NO_APPLICABLE_PRODUCTS',
          valid: false
        });
      }
    }

    let discount = 0;
    if (orderAmount) {
      const amount = parseFloat(orderAmount as string);
      
      if (coupon.type === 'PERCENTAGE') {
        discount = (amount * coupon.value.toNumber()) / 100;
        if (coupon.maxDiscount) {
          discount = Math.min(discount, coupon.maxDiscount.toNumber());
        }
      } else if (coupon.type === 'FIXED_AMOUNT') {
        discount = coupon.value.toNumber();
      }
    }

    res.json({
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        type: coupon.type,
        value: coupon.value,
        discount,
        description: coupon.description,
        applicationType: coupon.applicationType,
        applicableProducts,
        usageLimitPerUser: coupon.usageLimitPerUser,
        remainingUses: coupon.usageLimitPerUser 
          ? coupon.usageLimitPerUser - coupon.usages.length 
          : null,
        minAmount: coupon.minAmount,
        maxDiscount: coupon.maxDiscount
      }
    });

  } catch (error) {
    console.error('Error validating coupon:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      valid: false
    });
  }
};

// 🆕 REGISTRAR USO DEL CUPÓN
export const recordCouponUsage = async (
  couponId: string,
  userId: string,
  orderId: string,
  discountAmount: number,
  orderTotal: number,
  productsApplied: any[]
) => {
  try {
    await prisma.couponUsage.create({
      data: {
        couponId,
        userId,
        orderId,
        discountAmount,
        orderTotal,
        productsApplied: JSON.stringify(productsApplied)
      }
    });

    await prisma.coupon.update({
      where: { id: couponId },
      data: {
        usageCount: { increment: 1 }
      }
    });

    console.log(`Cupón usado: ${couponId} por usuario ${userId} en orden ${orderId}`);
    
  } catch (error) {
    console.error('Error recording coupon usage:', error);
    throw error;
  }
};

// 🆕 OBTENER HISTORIAL DE USO DE UN CUPÓN
export const getCouponUsageHistory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!verifyAdminAccess(req, res)) return;

    const { id } = req.params;
    const { page = '1', limit = '20' } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    const [usages, total] = await Promise.all([
      prisma.couponUsage.findMany({
        where: { couponId: id },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true
            }
          },
          order: {
            select: {
              id: true,
              orderNumber: true,
              status: true
            }
          }
        },
        orderBy: { usedAt: 'desc' },
        skip,
        take: limitNum
      }),
      prisma.couponUsage.count({ where: { couponId: id } })
    ]);

    res.json({
      usages: usages.map(usage => ({
        ...usage,
        productsApplied: usage.productsApplied 
          ? JSON.parse(usage.productsApplied as string) 
          : []
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.ceil(total / limitNum)
      }
    });

  } catch (error) {
    console.error('Error getting coupon usage history:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
};

// 🆕 VERIFICAR SI UN USUARIO YA USÓ UN CUPÓN
export const checkUserCouponUsage = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { code } = req.params;
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: 'Usuario no autenticado'
      });
    }

    const coupon = await prisma.coupon.findUnique({
      where: { code: code.toUpperCase() },
      include: {
        usages: {
          where: { userId },
          select: {
            id: true,
            usedAt: true,
            discountAmount: true,
            order: {
              select: {
                orderNumber: true,
                createdAt: true
              }
            }
          }
        }
      }
    });

    if (!coupon) {
      return res.status(404).json({
        error: 'Cupón no encontrado'
      });
    }

    const hasUsed = coupon.usages.length > 0;
    const canUseAgain = coupon.usageLimitPerUser 
      ? coupon.usages.length < coupon.usageLimitPerUser 
      : true;

    res.json({
      hasUsed,
      canUseAgain,
      usageCount: coupon.usages.length,
      usageLimitPerUser: coupon.usageLimitPerUser,
      remainingUses: coupon.usageLimitPerUser 
        ? coupon.usageLimitPerUser - coupon.usages.length 
        : null,
      lastUsed: coupon.usages[0]?.usedAt || null,
      usageHistory: coupon.usages
    });

  } catch (error) {
    console.error('Error checking user coupon usage:', error);
    res.status(500).json({
      error: 'Error interno del servidor'
    });
  }
};