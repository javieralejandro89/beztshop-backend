// src/controllers/accountController.ts - Controlador para cuenta de usuario
import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import { PDFService } from '../services/pdfService';


const prisma = new PrismaClient();

// Schemas de validación
const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName: z.string().min(1).max(50).optional(),
  phone: z.string().optional()
});

const addressSchema = z.object({
  name: z.string().min(1, 'Nombre es requerido'),
  street: z.string().min(1, 'Dirección es requerida'),
  city: z.string().min(1, 'Ciudad es requerida'),
  state: z.string().min(1, 'Estado es requerido'),
  zipCode: z.string().min(1, 'Código postal es requerido'),
  country: z.string().min(1, 'País es requerido'),
  isDefault: z.boolean().default(false)
});

const paymentMethodSchema = z.object({
  type: z.enum(['CARD', 'PAYPAL', 'BANK_TRANSFER', 'CASH_ON_DELIVERY']),
  last4: z.string().optional(),
  brand: z.string().optional(),
  expiryMonth: z.number().min(1).max(12).optional(),
  expiryYear: z.number().optional(),
  stripePaymentMethodId: z.string().optional(),
  paypalEmail: z.string().email().optional(),
  isDefault: z.boolean().default(false)
});

// Obtener perfil completo del usuario
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
        error: 'Usuario no encontrado'
      });
    }

    res.json({ user });

  } catch (error) {
    console.error('Error obteniendo perfil:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Actualizar perfil del usuario
export const updateProfile = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    
    const validation = updateProfileSchema.safeParse(req.body);
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
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener pedidos del usuario
export const getOrders = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Filtros avanzados
    const {
      search,
      status,
      paymentStatus,
      dateFrom,
      dateTo,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    // Construir filtros dinámicos
    const whereConditions: any = { userId };

    // Filtro por número de pedido
    if (search) {
      whereConditions.orderNumber = {
        contains: search as string        
      };
    }

    // Filtro por estado del pedido
    if (status) {
  whereConditions.status = (status as string).toUpperCase();
}

// Filtro por estado del pago
if (paymentStatus) {
  whereConditions.paymentStatus = (paymentStatus as string).toUpperCase();
}

    // Filtro por rango de fechas
    if (dateFrom || dateTo) {
      whereConditions.createdAt = {};
      
      if (dateFrom) {
        whereConditions.createdAt.gte = new Date(dateFrom as string);
      }
      
      if (dateTo) {
        // Agregar 23:59:59 al día final para incluir todo el día
        const endDate = new Date(dateTo as string);
        endDate.setHours(23, 59, 59, 999);
        whereConditions.createdAt.lte = endDate;
      }
    }

    // Configurar ordenamiento
    const orderBy: any = {};
    const validSortFields = ['createdAt', 'totalAmount', 'orderNumber', 'status'];
    const sortField = validSortFields.includes(sortBy as string) ? sortBy : 'createdAt';
    const sortDirection = sortOrder === 'asc' ? 'asc' : 'desc';
    orderBy[sortField as string] = sortDirection;

    const [orders, total] = await Promise.all([
      prisma.order.findMany({
        where: whereConditions,
        include: {
          items: {
            include: {
              product: {
                select: {
                  id: true,
                  name: true,
                  images: true,
                  slug: true
                }
              }
            }
          }
        },
        orderBy,
        skip,
        take: limit
      }),
      prisma.order.count({
        where: whereConditions
      })
    ]);

    const formattedOrders = orders.map(order => ({
      id: order.id,
      orderNumber: order.orderNumber,
      date: order.createdAt,
      status: order.status.toLowerCase(),
      paymentStatus: order.paymentStatus.toLowerCase(),
      total: Number(order.totalAmount),
      subtotal: Number(order.subtotal),
      tax: Number(order.taxAmount),
      shipping: Number(order.shippingAmount),
      discount: Number(order.discountAmount),
      shippingAddress: order.shippingAddress,
      billingAddress: order.billingAddress,
      trackingNumber: order.trackingNumber,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      items: order.items.map(item => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        price: Number(item.price),
        totalPrice: Number(item.totalPrice),
        variants: item.variants,
        product: item.product ? {
          id: item.product.id,
          name: item.product.name,
          slug: item.product.slug,
          image: Array.isArray(item.product.images) && item.product.images.length > 0 
            ? (item.product.images as any[])[0]?.url || null
            : null
        } : null
      }))
    }));

    res.json({
      orders: formattedOrders,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      },
      filters: {
        search,
        status,
        paymentStatus,
        dateFrom,
        dateTo,
        sortBy,
        sortOrder
      }
    });

  } catch (error) {
    console.error('Error obteniendo pedidos:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener pedido por ID
export const getOrderById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const orderId = req.params.id;

    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        userId
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                images: true,
                slug: true
              }
            }
          }
        }
      }
    });

    if (!order) {
      return res.status(404).json({
        error: 'Pedido no encontrado'
      });
    }

    const formattedOrder = {
      id: order.id,
      orderNumber: order.orderNumber,
      date: order.createdAt,
      status: order.status.toLowerCase(),
      paymentStatus: order.paymentStatus.toLowerCase(),
      total: Number(order.totalAmount),
      subtotal: Number(order.subtotal),
      tax: Number(order.taxAmount),
      shipping: Number(order.shippingAmount),
      discount: Number(order.discountAmount),
      shippingAddress: order.shippingAddress ? JSON.parse(order.shippingAddress as string) : null,
      billingAddress: order.billingAddress ? JSON.parse(order.billingAddress as string) : null,
      paymentMethod: order.paymentMethod || null,
      trackingNumber: order.trackingNumber,
      shippedAt: order.shippedAt,
      deliveredAt: order.deliveredAt,
      notes: order.notes,
      items: order.items.map(item => ({
        id: item.id,
        productId: item.productId,
        productName: item.productName,
        quantity: item.quantity,
        price: Number(item.price),
        totalPrice: Number(item.totalPrice),
        variants: item.variants ? JSON.parse(item.variants as string) : null,
        product: item.product ? {
          id: item.product.id,
          name: item.product.name,
          slug: item.product.slug,
          image: Array.isArray(item.product.images) && item.product.images.length > 0 
            ? (item.product.images as any[])[0]?.url || null
            : null
        } : null
      }))
    };

    res.json({ order: formattedOrder });

  } catch (error) {
    console.error('Error obteniendo pedido:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener direcciones del usuario
export const getAddresses = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const addresses = await prisma.userAddress.findMany({
      where: { userId },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    const formattedAddresses = addresses.map(address => ({
      id: address.id,
      name: address.name,
      street: address.street,
      city: address.city,
      state: address.state,
      zipCode: address.zipCode,
      country: address.country,
      isDefault: address.isDefault,
      createdAt: address.createdAt,
      updatedAt: address.updatedAt
    }));

    res.json({ addresses: formattedAddresses });

  } catch (error) {
    console.error('Error obteniendo direcciones:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Crear nueva dirección
export const createAddress = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        error: 'Usuario no autenticado'
      });
    }
    
    const validation = addressSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const addressData = validation.data;

    // Si es dirección por defecto, quitar el default de las otras
    if (addressData.isDefault) {
      await prisma.userAddress.updateMany({
        where: { userId },
        data: { isDefault: false }
      });
    }

    const address = await prisma.userAddress.create({
      data: {
        ...addressData,
        userId
      }
    });

    res.status(201).json({
      message: 'Dirección creada exitosamente',
      address
    });

  } catch (error) {
    console.error('Error creando dirección:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Actualizar dirección
export const updateAddress = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const addressId = req.params.id;
    
    const validation = addressSchema.partial().safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    // Verificar que la dirección pertenece al usuario
    const existingAddress = await prisma.userAddress.findFirst({
      where: {
        id: addressId,
        userId
      }
    });

    if (!existingAddress) {
      return res.status(404).json({
        error: 'Dirección no encontrada'
      });
    }

    const addressData = validation.data;

    // Si es dirección por defecto, quitar el default de las otras
    if (addressData.isDefault) {
      await prisma.userAddress.updateMany({
        where: { userId },
        data: { isDefault: false }
      });
    }

    const updatedAddress = await prisma.userAddress.update({
      where: { id: addressId },
      data: addressData
    });

    res.json({
      message: 'Dirección actualizada exitosamente',
      address: updatedAddress
    });

  } catch (error) {
    console.error('Error actualizando dirección:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Eliminar dirección
export const deleteAddress = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const addressId = req.params.id;

    // Verificar que la dirección pertenece al usuario
    const existingAddress = await prisma.userAddress.findFirst({
      where: {
        id: addressId,
        userId
      }
    });

    if (!existingAddress) {
      return res.status(404).json({
        error: 'Dirección no encontrada'
      });
    }

    await prisma.userAddress.delete({
      where: { id: addressId }
    });

    res.json({
      message: 'Dirección eliminada exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando dirección:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener métodos de pago del usuario
export const getPaymentMethods = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const paymentMethods = await prisma.userPaymentMethod.findMany({
      where: { userId },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    const formattedPaymentMethods = paymentMethods.map(method => ({
      id: method.id,
      type: method.type.toLowerCase(),
      last4: method.last4,
      brand: method.brand,
      expiryMonth: method.expiryMonth,
      expiryYear: method.expiryYear,
      paypalEmail: method.paypalEmail,
      isDefault: method.isDefault,
      createdAt: method.createdAt
    }));

    res.json({ paymentMethods: formattedPaymentMethods });

  } catch (error) {
    console.error('Error obteniendo métodos de pago:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const createPaymentMethodWithToken = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    const { type, isDefault, paypalEmail } = req.body;

    // Square no permite guardar tarjetas reales, solo metadatos
    let paymentMethodData: any = {
      userId,
      type: type.toUpperCase(),
      isDefault: !!isDefault
    };

    if (type.toUpperCase() === 'CARD') {
      // Para tarjetas, solo guardamos que el usuario prefiere usar tarjeta
      // En checkout tendrá que ingresar los datos nuevamente (normal con Square)
      paymentMethodData.last4 = null;
      paymentMethodData.brand = 'Square Card';
    } else if (type.toUpperCase() === 'PAYPAL') {
      paymentMethodData.paypalEmail = paypalEmail;
    }

    // Si es predeterminado, quitar flag de otros métodos
    if (isDefault) {
      await prisma.userPaymentMethod.updateMany({
        where: { userId },
        data: { isDefault: false }
      });
    }

    const paymentMethod = await prisma.userPaymentMethod.create({
      data: paymentMethodData
    });

    res.status(201).json({
      message: 'Método de pago agregado exitosamente',
      paymentMethod: {
        id: paymentMethod.id,
        type: paymentMethod.type.toLowerCase(),
        last4: paymentMethod.last4,
        brand: paymentMethod.brand,
        paypalEmail: paymentMethod.paypalEmail,
        isDefault: paymentMethod.isDefault
      }
    });

  } catch (error: any) {
    console.error('Error creating payment method:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

        
// Crear nuevo método de pago
export const createPaymentMethod = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        error: 'Usuario no autenticado'
      });
    }
    
    const validation = paymentMethodSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const paymentData = validation.data;

    // Si es método por defecto, quitar el default de los otros
    if (paymentData.isDefault) {
      await prisma.userPaymentMethod.updateMany({
        where: { userId },
        data: { isDefault: false }
      });
    }

    const paymentMethod = await prisma.userPaymentMethod.create({
      data: {
        ...paymentData,
        userId
      }
    });

    res.status(201).json({
      message: 'Método de pago creado exitosamente',
      paymentMethod
    });

  } catch (error) {
    console.error('Error creando método de pago:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Eliminar método de pago
export const deletePaymentMethod = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const paymentMethodId = req.params.id;

    // Verificar que el método pertenece al usuario
    const existingMethod = await prisma.userPaymentMethod.findFirst({
      where: {
        id: paymentMethodId,
        userId
      }
    });

    if (!existingMethod) {
      return res.status(404).json({
        error: 'Método de pago no encontrado'
      });
    }

    await prisma.userPaymentMethod.delete({
      where: { id: paymentMethodId }
    });

    res.json({
      message: 'Método de pago eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error eliminando método de pago:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener estadísticas de la cuenta
// src/controllers/accountController.ts - Función getAccountStats actualizada
// Reemplazar la función getAccountStats existente con esta versión:

export const getAccountStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;

    const [orderCount, addressCount, paymentMethodCount, wishlistCount] = await Promise.all([
      prisma.order.count({
        where: { userId }
      }),
      prisma.userAddress.count({
        where: { userId }
      }),
      prisma.userPaymentMethod.count({
        where: { userId }
      }),
      prisma.wishlistItem.count({
        where: { userId }
      })
    ]);

    const stats = {
      totalOrders: orderCount,
      totalAddresses: addressCount,
      totalPaymentMethods: paymentMethodCount,
      wishlistItems: wishlistCount
    };

    res.json({ stats });

  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const downloadInvoice = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const orderId = req.params.orderId;

    if (!userId) {
      return res.status(401).json({
        error: 'Usuario no autenticado'
      });
    }

    // Verificar que el pedido pertenece al usuario
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        userId
      },
      select: { id: true, orderNumber: true, status: true }
    });

    if (!order) {
      return res.status(404).json({
        error: 'Pedido no encontrado'
      });
    }

    // Solo permitir descarga de facturas para pedidos confirmados/entregados
    if (!['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(order.status)) {
      return res.status(400).json({
        error: 'La factura solo está disponible para pedidos confirmados'
      });
    }

    // Generar PDF
    const pdfBuffer = await PDFService.generateInvoice(orderId, userId);

    // Configurar headers para descarga
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="factura-${order.orderNumber}.pdf"`,
      'Content-Length': pdfBuffer.length.toString(),
    });

    console.log(`Factura descargada para pedido ${order.orderNumber} por usuario ${userId}`);

    res.send(pdfBuffer);

  } catch (error) {
    console.error('Error generando factura:', error);
    res.status(500).json({ error: 'Error al generar la factura' });
  }
};