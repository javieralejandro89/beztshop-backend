// src/controllers/adminOrdersController.ts - Controlador para gestión de pedidos por admin
import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import { PDFService } from '../services/pdfService';
import { emailService } from '../services/emailService';
import { orderStatusTemplate, orderCreatedTemplate } from '../templates/emailTemplates';

const prisma = new PrismaClient();

// Función auxiliar para parsear campos JSON
const parseJsonField = (field: any) => {
  if (typeof field === 'string') {
    try {
      return JSON.parse(field);
    } catch {
      return field;
    }
  }
  return field;
};

// Schemas de validación
const updateOrderStatusSchema = z.object({
  status: z.enum(['PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED']),
  trackingNumber: z.string().optional(),
  notes: z.string().optional(),
  notifyCustomer: z.boolean().default(true)
});

const sendNotificationSchema = z.object({
  subject: z.string().min(1, 'Asunto es requerido'),
  message: z.string().min(1, 'Mensaje es requerido'),
  type: z.enum(['ORDER_UPDATE', 'PROMOTIONAL', 'CUSTOM']).default('ORDER_UPDATE')
});

// Obtener lista de pedidos con filtros y paginación
export const getOrders = async (req: AuthenticatedRequest, res: Response) => {
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
      status = '',
      paymentStatus = '',
      dateFrom = '',
      dateTo = '',
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const pageNum = parseInt(page as string);
    const limitNum = parseInt(limit as string);
    const skip = (pageNum - 1) * limitNum;

    // Construir filtros
    const where: any = {};

    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { guestEmail: { contains: search, mode: 'insensitive' } },
        { user: {
          OR: [
            { email: { contains: search, mode: 'insensitive' } },
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } }
          ]
        }}
      ];
    }

    if (status) {
      where.status = status;
    }

    if (paymentStatus) {
      where.paymentStatus = paymentStatus;
    }

    if (dateFrom || dateTo) {
      where.createdAt = {};
      if (dateFrom) {
        where.createdAt.gte = new Date(dateFrom as string);
      }
      if (dateTo) {
        where.createdAt.lte = new Date(new Date(dateTo as string).getTime() + 24 * 60 * 60 * 1000 - 1);
      }
    }

    // Obtener pedidos
    const [ordersRaw, total] = await Promise.all([
      prisma.order.findMany({
        where,
        select: {
          id: true,
          orderNumber: true,
          userId: true,
          guestEmail: true,
          subtotal: true,
          taxAmount: true,
          shippingAmount: true,
          discountAmount: true,
          totalAmount: true,
          status: true,
          paymentStatus: true,
          paymentMethod: true,
          shippingAddress: true,
          notes: true,
          trackingNumber: true,
          createdAt: true,
          updatedAt: true,
          shippedAt: true,
          deliveredAt: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true
            }
          },
          items: {
            select: {
              id: true,
              productName: true,
              quantity: true,
              price: true,
              totalPrice: true,
              product: {
                select: {
                  id: true,
                  images: true
                }
              }
            }
          }
        },
        orderBy: {
          [sortBy as string]: sortOrder as 'asc' | 'desc'
        },
        skip,
        take: limitNum
      }),
      prisma.order.count({ where })
    ]);

    // CORRECCIÓN: Parsear campos JSON
    const orders = ordersRaw.map(order => ({
      ...order,
      shippingAddress: parseJsonField(order.shippingAddress),
    }));

    const pages = Math.ceil(total / limitNum);
    const hasNext = pageNum < pages;
    const hasPrev = pageNum > 1;

    res.json({
      orders,
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
    console.error('Error getting orders:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Actualizar la función getOrderById
export const getOrderById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Verificar que el usuario sea admin
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Acceso denegado',
        code: 'ACCESS_DENIED'
      });
    }

    const { id } = req.params;

    const orderRaw = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        orderNumber: true,
        userId: true,
        guestEmail: true,
        subtotal: true,
        taxAmount: true,
        shippingAmount: true,
        discountAmount: true,
        totalAmount: true,
        currency: true,
        status: true,
        paymentStatus: true,
        paymentMethod: true,
        paymentId: true,
        shippingAddress: true,
        billingAddress: true,
        notes: true,
        trackingNumber: true,
        shippedAt: true,
        deliveredAt: true,
        cancelledAt: true,
        refundedAt: true,
        createdAt: true,
        updatedAt: true,
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true
          }
        },
        items: {
          select: {
            id: true,
            productId: true,
            productName: true,
            quantity: true,
            price: true,
            totalPrice: true,
            variants: true,
            productData: true,
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

    if (!orderRaw) {
      return res.status(404).json({
        error: 'Pedido no encontrado',
        code: 'ORDER_NOT_FOUND'
      });
    }

    // CORRECCIÓN: Parsear campos JSON
    const order = {
      ...orderRaw,
      shippingAddress: parseJsonField(orderRaw.shippingAddress),
      billingAddress: parseJsonField(orderRaw.billingAddress),
      items: orderRaw.items.map(item => ({
        ...item,
        variants: parseJsonField(item.variants),
        productData: parseJsonField(item.productData)
      }))
    };

    res.json({ order });

  } catch (error) {
    console.error('Error getting order by ID:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Actualizar estado del pedido
export const updateOrderStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Verificar que el usuario sea admin
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Acceso denegado',
        code: 'ACCESS_DENIED'
      });
    }

    const { id } = req.params;
    const validation = updateOrderStatusSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const { status, trackingNumber, notes, notifyCustomer } = validation.data;

    // Verificar que el pedido existe
    const existingOrder = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        orderNumber: true,
        status: true,
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true
          }
        },
        guestEmail: true
      }
    });

    if (!existingOrder) {
      return res.status(404).json({
        error: 'Pedido no encontrado',
        code: 'ORDER_NOT_FOUND'
      });
    }

    // Preparar datos de actualización
    const updateData: any = { 
      status,
      updatedAt: new Date()
    };

    // Agregar campos específicos según el estado
    if (status === 'SHIPPED' && trackingNumber) {
      updateData.trackingNumber = trackingNumber;
      updateData.shippedAt = new Date();
    } else if (status === 'DELIVERED') {
      updateData.deliveredAt = new Date();
    } else if (status === 'CANCELLED') {
      updateData.cancelledAt = new Date();
    } else if (status === 'REFUNDED') {
      updateData.refundedAt = new Date();
      updateData.paymentStatus = 'REFUNDED';
      } else if (status === 'CONFIRMED') {
  // ✅ NUEVO: Para pagos Zelle, actualizar también el estado del pago
  const order = await prisma.order.findUnique({
    where: { id },
    select: { paymentMethod: true, paymentStatus: true }
  });
  
  if (order?.paymentMethod === 'zelle' && order?.paymentStatus === 'PENDING') {
    updateData.paymentStatus = 'PAID';
    console.log(`✅ Actualizando pago Zelle a PAID para pedido ${existingOrder.orderNumber}`);
  }
    }

    // Actualizar pedido
    const updatedOrder = await prisma.order.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        trackingNumber: true,
        updatedAt: true
      }
    });

    // Crear registro de historial del pedido
    if (notes) {
      await prisma.order.update({
        where: { id },
        data: {
          notes: notes
        }
      });
    }

    // Enviar notificación al cliente si se solicita
    if (notifyCustomer) {
      const customerEmail = existingOrder.user?.email || existingOrder.guestEmail;
      const customerName = existingOrder.user 
        ? `${existingOrder.user.firstName} ${existingOrder.user.lastName}`
        : 'Cliente';

      if (customerEmail) {
        // Aquí iría la lógica de envío de email
        // Por ahora solo registramos en consola
        console.log(`Notificación enviada a ${customerEmail}: Pedido ${existingOrder.orderNumber} actualizado a ${status}`);
        
        // TODO: Implementar envío real de email usando el servicio de email configurado
        try {
          await sendOrderStatusNotification({
            email: customerEmail,
            customerName,
            orderNumber: existingOrder.orderNumber,
            status,
            trackingNumber,
            notes
          });
        } catch (emailError) {
          console.error('Error sending notification email:', emailError);
          // No fallar la actualización por error en email
        }
      }
    }

    console.log(`Estado de pedido actualizado por admin: ${existingOrder.orderNumber} -> ${status} (por: ${req.user?.email})`);

    res.json({
      message: 'Estado del pedido actualizado exitosamente',
      order: updatedOrder
    });

  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Enviar notificación personalizada al cliente
export const sendCustomNotification = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Verificar que el usuario sea admin
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Acceso denegado',
        code: 'ACCESS_DENIED'
      });
    }

    const { id } = req.params;
    const validation = sendNotificationSchema.safeParse(req.body);

    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const { subject, message, type } = validation.data;

    // Obtener información del pedido y cliente
    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        orderNumber: true,
        user: {
          select: {
            email: true,
            firstName: true,
            lastName: true
          }
        },
        guestEmail: true
      }
    });

    if (!order) {
      return res.status(404).json({
        error: 'Pedido no encontrado',
        code: 'ORDER_NOT_FOUND'
      });
    }

    const customerEmail = order.user?.email || order.guestEmail;
    const customerName = order.user 
      ? `${order.user.firstName} ${order.user.lastName}`
      : 'Cliente';

    if (!customerEmail) {
      return res.status(400).json({
        error: 'No se encontró email del cliente',
        code: 'CUSTOMER_EMAIL_NOT_FOUND'
      });
    }

    // Enviar notificación
    try {
      await sendCustomOrderNotification({
        email: customerEmail,
        customerName,
        orderNumber: order.orderNumber,
        subject,
        message,
        type
      });

      console.log(`Notificación personalizada enviada por admin a ${customerEmail} para pedido ${order.orderNumber} (por: ${req.user?.email})`);

      res.json({
        message: 'Notificación enviada exitosamente'
      });

    } catch (emailError) {
      console.error('Error sending custom notification:', emailError);
      res.status(500).json({
        error: 'Error al enviar la notificación',
        code: 'EMAIL_SEND_ERROR'
      });
    }

  } catch (error) {
    console.error('Error sending custom notification:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Generar y descargar factura
export const generateInvoice = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Verificar que el usuario sea admin
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Acceso denegado',
        code: 'ACCESS_DENIED'
      });
    }

    const { id } = req.params;

    // Verificar que el pedido existe
    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        orderNumber: true,
        userId: true,
        status: true
      }
    });

    if (!order) {
      return res.status(404).json({
        error: 'Pedido no encontrado',
        code: 'ORDER_NOT_FOUND'
      });
    }

    // Verificar que el pedido tenga un estado que permita facturación
    if (!['CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED'].includes(order.status)) {
      return res.status(400).json({
        error: 'El pedido debe estar confirmado para generar factura',
        code: 'ORDER_NOT_CONFIRMED'
      });
    }

    // CORREGIDO: Usar PDFService real
    const pdfBuffer = await PDFService.generateInvoice(order.id, order.userId || '');

    // Configurar headers correctos para PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="factura-${order.orderNumber}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length.toString());
    
    // Enviar el buffer directamente
    res.end(pdfBuffer);

  } catch (error) {
    console.error('Error generating invoice:', error);
    res.status(500).json({
      error: 'Error al generar la factura',
      code: 'INVOICE_GENERATION_ERROR'
    });
  }
};

// Obtener estadísticas de pedidos
export const getOrderStats = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Verificar que el usuario sea admin
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Acceso denegado',
        code: 'ACCESS_DENIED'
      });
    }

    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      totalOrders,
      ordersThisMonth,
      ordersToday,
      pendingOrders,
      processingOrders,
      shippedOrders,
      completedOrders,
      cancelledOrders,
      totalRevenue,
      revenueThisMonth
    ] = await Promise.all([
      prisma.order.count(),
      prisma.order.count({ where: { createdAt: { gte: startOfMonth } } }),
      prisma.order.count({ where: { createdAt: { gte: startOfDay } } }),
      prisma.order.count({ where: { status: 'PENDING' } }),
      prisma.order.count({ where: { status: { in: ['CONFIRMED', 'PROCESSING'] } } }),
      prisma.order.count({ where: { status: 'SHIPPED' } }),
      prisma.order.count({ where: { status: 'DELIVERED' } }),
      prisma.order.count({ where: { status: { in: ['CANCELLED', 'REFUNDED'] } } }),
      prisma.order.aggregate({
        where: { status: { not: 'CANCELLED' } },
        _sum: { totalAmount: true }
      }),
      prisma.order.aggregate({
        where: { 
          createdAt: { gte: startOfMonth },
          status: { not: 'CANCELLED' }
        },
        _sum: { totalAmount: true }
      })
    ]);

    // Estadísticas por estado
    const statusStats = await prisma.order.groupBy({
      by: ['status'],
      _count: { id: true }
    });

    // Estadísticas por método de pago
    const paymentMethodStats = await prisma.order.groupBy({
      by: ['paymentMethod'],
      where: { paymentMethod: { not: null } },
      _count: { id: true }
    });

    res.json({
      stats: {
        total: totalOrders,
        thisMonth: ordersThisMonth,
        today: ordersToday,
        pending: pendingOrders,
        processing: processingOrders,
        shipped: shippedOrders,
        completed: completedOrders,
        cancelled: cancelledOrders,
        revenue: {
          total: totalRevenue._sum.totalAmount || 0,
          thisMonth: revenueThisMonth._sum.totalAmount || 0
        },
        byStatus: statusStats.reduce((acc, curr) => {
          acc[curr.status] = curr._count.id;
          return acc;
        }, {} as Record<string, number>),
        byPaymentMethod: paymentMethodStats.reduce((acc, curr) => {
          if (curr.paymentMethod) {
            acc[curr.paymentMethod] = curr._count.id;
          }
          return acc;
        }, {} as Record<string, number>)
      }
    });

  } catch (error) {
    console.error('Error getting order stats:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Eliminar pedido (soft delete o hard delete según prefieras)
export const deleteOrder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Verificar que el usuario sea admin
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({
        error: 'Acceso denegado',
        code: 'ACCESS_DENIED'
      });
    }

    const { id } = req.params;

    // Verificar que el pedido existe
    const order = await prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        orderNumber: true,
        status: true
      }
    });

    if (!order) {
      return res.status(404).json({
        error: 'Pedido no encontrado',
        code: 'ORDER_NOT_FOUND'
      });
    }

    // Verificar que el pedido puede ser eliminado (opcional - solo cancelados/antiguos)
    // Si quieres restringir, descomenta esto:
    /*
    const allowedStatuses = ['CANCELLED', 'REFUNDED'];
    if (!allowedStatuses.includes(order.status)) {
      return res.status(400).json({
        error: 'Solo se pueden eliminar pedidos cancelados o reembolsados',
        code: 'INVALID_ORDER_STATUS'
      });
    }
    */

    // OPCIÓN 1: HARD DELETE (eliminar permanentemente)
    // Eliminar items del pedido primero
    await prisma.orderItem.deleteMany({
      where: { orderId: id }
    });

    // Eliminar el pedido
    await prisma.order.delete({
      where: { id }
    });

    console.log(`Pedido ${order.orderNumber} eliminado permanentemente por admin: ${req.user?.email}`);

    res.json({
      message: 'Pedido eliminado exitosamente',
      orderNumber: order.orderNumber
    });

  } catch (error) {
    console.error('Error deleting order:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Funciones auxiliares para notificaciones y generación de PDFs

// Enviar notificación de cambio de estado
// Enviar notificación de cambio de estado (MEJORADA)
// ✅ Versiones mejoradas de las funciones de notificación para adminOrdersController.ts

// Enviar notificación de cambio de estado (MEJORADA)
async function sendOrderStatusNotification(params: {
  email: string;
  customerName: string;
  orderNumber: string;
  status: string;
  trackingNumber?: string;
  notes?: string;
}) {
  try {
    const html = orderStatusTemplate({
      customerName: params.customerName,
      orderNumber: params.orderNumber,
      status: params.status,
      trackingNumber: params.trackingNumber,
      notes: params.notes
    });

    const result = await emailService.sendEmail({
      to: params.email,
      subject: `Actualización de tu pedido #${params.orderNumber}`,
      html,
      from: 'BeztShop <atencionalcliente@beztshop.com>'
    });

    if (!result.success) {
      throw new Error(`Error enviando email: ${result.error}`);
    }

    console.log(`✅ Notificación enviada exitosamente a ${params.email} para pedido ${params.orderNumber} (ID: ${result.id})`);
    return result;

  } catch (error: any) {
    console.error('❌ Error enviando notificación de estado:', {
      error: error.message,
      email: params.email,
      orderNumber: params.orderNumber
    });
    throw error;
  }
}

// Enviar notificación personalizada (MEJORADA)
async function sendCustomOrderNotification(params: {
  email: string;
  customerName: string;
  orderNumber: string;
  subject: string;
  message: string;
  type: string;
}) {
  try {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <title>${params.subject}</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
                  <h2 style="margin: 0; text-align: center;">BeztShop</h2>
              </div>
              
              <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
                  <h3 style="color: #1f2937; margin-top: 0;">Mensaje sobre tu pedido #${params.orderNumber}</h3>
                  <p>Hola ${params.customerName},</p>
                  
                  <div style="background: white; padding: 25px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2563eb;">
                      ${params.message.replace(/\n/g, '<br>')}
                  </div>
                  
                  <p style="margin-bottom: 30px;">Si tienes alguna pregunta, no dudes en contactarnos.</p>
                  
                  <div style="text-align: center; margin-top: 30px;">
                      <p style="color: #6b7280; font-size: 14px;">
                          Gracias por confiar en BeztShop
                      </p>
                  </div>
              </div>
              
              <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
                  <p style="font-size: 12px; color: #9ca3af;">
                      Este es un email automático, por favor no respondas directamente a este mensaje.
                      <br>
                      Para soporte, contacta a: atencionalcliente@beztshop.com
                  </p>
              </div>
          </div>
      </body>
      </html>
    `;

    const result = await emailService.sendEmail({
      to: params.email,
      subject: params.subject,
      html,
      from: 'BeztShop <atencionalcliente@beztshop.com>'
    });

    if (!result.success) {
      throw new Error(`Error enviando email: ${result.error}`);
    }

    console.log(`✅ Notificación personalizada enviada exitosamente a ${params.email} (ID: ${result.id})`);
    return result;

  } catch (error: any) {
    console.error('❌ Error enviando notificación personalizada:', {
      error: error.message,
      email: params.email,
      subject: params.subject
    });
    throw error;
  }
}

// ✅ NUEVA: Template para notificación de nueva orden al admin
export const adminOrderNotificationTemplate = (data: {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  total: number;
  paymentMethod: string;
  status: string;
  itemsCount: number;
  shippingAddress: any;
}) => {
  const paymentStatusBadge = data.paymentMethod === 'zelle' 
    ? '<span style="background: #fbbf24; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 12px;">ZELLE - PENDIENTE</span>'
    : '<span style="background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">PENDIENTE PAGO</span>';

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Nueva Orden Creada</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                <h2 style="margin: 0;">🔔 Nueva Orden Creada</h2>
                <p style="margin: 5px 0 0 0; opacity: 0.9;">Panel de Administración - BeztShop</p>
            </div>
            
            <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
                <h3 style="color: #1f2937; margin-top: 0;">Pedido #${data.orderNumber}</h3>
                
                <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Cliente:</strong></td>
                            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">${data.customerName}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Email:</strong></td>
                            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">${data.customerEmail}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Total:</strong></td>
                            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; font-weight: bold; color: #059669;">${data.total.toFixed(2)} MXN</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Método de Pago:</strong></td>
                            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">${data.paymentMethod.toUpperCase()} ${paymentStatusBadge}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Items:</strong></td>
                            <td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;">${data.itemsCount} producto(s)</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0;"><strong>Dirección:</strong></td>
                            <td style="padding: 8px 0;">
                                ${data.shippingAddress.name}<br>
                                ${data.shippingAddress.street}<br>
                                ${data.shippingAddress.city}, ${data.shippingAddress.state} ${data.shippingAddress.zipCode}<br>
                                ${data.shippingAddress.country}
                            </td>
                        </tr>
                    </table>
                </div>
                
                ${data.paymentMethod === 'zelle' ? `
                    <div style="background: #fef3c7; border: 1px solid #fbbf24; padding: 15px; border-radius: 8px; margin: 20px 0;">
                        <h4 style="color: #92400e; margin-top: 0;">⚠️ Acción Requerida - Pago Zelle</h4>
                        <p style="margin-bottom: 0; color: #92400e;">
                            Esta orden requiere confirmación manual del pago por Zelle antes de procesar el envío.
                        </p>
                    </div>
                ` : ''}
                
                <div style="text-align: center; margin-top: 30px;">
                    <a href="${process.env.FRONTEND_URL}/admin/orders/${data.orderNumber}" 
                       style="background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
                        Ver Pedido en Admin
                    </a>
                </div>
            </div>
            
            <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center;">
                <p style="font-size: 12px; color: #9ca3af;">
                    Panel de Administración - BeztShop<br>
                    ${new Date().toLocaleDateString('es-ES', { 
                        year: 'numeric', 
                        month: 'long', 
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                    })}
                </p>
            </div>
        </div>
    </body>
    </html>
  `;
};

// ✅ NUEVA: Función para enviar notificación al admin
async function sendAdminOrderNotification(orderData: {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  total: number;
  paymentMethod: string;
  status: string;
  itemsCount: number;
  shippingAddress: any;
}) {
  try {
    const adminEmail = 'atencionalcliente@beztshop.com'; // Email principal del admin
    
    const html = adminOrderNotificationTemplate(orderData);

    const result = await emailService.sendEmail({
      to: adminEmail,
      subject: `🔔 Nueva Orden #${orderData.orderNumber} - ${orderData.paymentMethod.toUpperCase()}`,
      html,
      from: 'BeztShop Sistema <atencionalcliente@beztshop.com>'
    });

    if (!result.success) {
      throw new Error(`Error enviando email a admin: ${result.error}`);
    }

    console.log(`✅ Notificación de nueva orden enviada al admin: ${orderData.orderNumber} (ID: ${result.id})`);
    return result;

  } catch (error: any) {
    console.error('❌ Error enviando notificación al admin:', {
      error: error.message,
      orderNumber: orderData.orderNumber
    });
    throw error;
  }
}

// ✅ NUEVA: Función para enviar notificación al cliente
async function sendCustomerOrderNotification(params: {
  email: string;
  customerName: string;
  orderNumber: string;
  total: number;
  items: Array<{productName: string; quantity: number; price: number}>;
  paymentMethod: string;
  isZelle?: boolean;
}) {
  try {
    // Template personalizado según método de pago
    let html;
    let subject;

    if (params.isZelle) {
      subject = `Pedido Recibido #${params.orderNumber} - Pendiente Confirmación Zelle`;
      html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Pedido Recibido - Pendiente Confirmación</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: #fbbf24; color: #92400e; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h2 style="margin: 0;">📝 Pedido Recibido</h2>
                    <p style="margin: 5px 0 0 0;">Pendiente de Confirmación de Pago</p>
                </div>
                
                <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
                    <p>Hola <strong>${params.customerName}</strong>,</p>
                    
                    <p>Hemos recibido tu pedido <strong>#${params.orderNumber}</strong> exitosamente.</p>
                    
                    <div style="background: #fef3c7; border: 1px solid #fbbf24; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h4 style="color: #92400e; margin-top: 0;">⏳ Pago por Zelle Pendiente</h4>
                        <p style="color: #92400e; margin-bottom: 0;">
                            Tu pedido está siendo procesado. Te contactaremos pronto con las instrucciones para completar 
                            el pago por Zelle y confirmar tu orden.
                        </p>
                    </div>
                    
                    <div style="background: white; padding: 25px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin-top: 0; color: #1f2937;">Resumen del Pedido:</h3>
                        ${params.items.map(item => `
                            <div style="display: flex; justify-content: space-between; margin: 15px 0; padding: 10px 0; border-bottom: 1px solid #f3f4f6;">
                                <span style="flex: 1;">${item.productName} <span style="color: #6b7280;">(x${item.quantity})</span></span>
                                <span style="font-weight: 600; color: #059669;">${(item.price * item.quantity).toFixed(2)}</span>
                            </div>
                        `).join('')}
                        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 18px; margin-top: 20px; padding-top: 15px; border-top: 2px solid #2563eb; color: #2563eb;">
                            <span>Total:</span>
                            <span>${params.total.toFixed(2)} MXN</span>
                        </div>
                    </div>
                    
                    <p>Nos pondremos en contacto contigo muy pronto para coordinar el pago y la entrega.</p>
                    <p>Gracias por confiar en <strong>BeztShop</strong>.</p>
                </div>
            </div>
        </body>
        </html>
      `;
    } else {
      // Template normal para otros métodos de pago
      subject = `¡Pedido Confirmado! #${params.orderNumber}`;
      html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>Pedido Confirmado</title>
        </head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: #10b981; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h2 style="margin: 0;">✅ ¡Pedido Confirmado!</h2>
                    <p style="margin: 5px 0 0 0; opacity: 0.9;">Tu compra ha sido procesada exitosamente</p>
                </div>
                
                <div style="background: #f0fdf4; padding: 30px; border-radius: 0 0 8px 8px;">
                    <p>Hola <strong>${params.customerName}</strong>,</p>
                    
                    <p>¡Gracias por tu compra! Tu pedido <strong>#${params.orderNumber}</strong> ha sido confirmado y está siendo preparado.</p>
                    
                    <div style="background: white; padding: 25px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
                        <h3 style="margin-top: 0; color: #1f2937;">Resumen del Pedido:</h3>
                        ${params.items.map(item => `
                            <div style="display: flex; justify-content: space-between; margin: 15px 0; padding: 10px 0; border-bottom: 1px solid #f3f4f6;">
                                <span style="flex: 1;">${item.productName} <span style="color: #6b7280;">(x${item.quantity})</span></span>
                                <span style="font-weight: 600; color: #059669;">${(item.price * item.quantity).toFixed(2)}</span>
                            </div>
                        `).join('')}
                        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 18px; margin-top: 20px; padding-top: 15px; border-top: 2px solid #10b981; color: #10b981;">
                            <span>Total:</span>
                            <span>${params.total.toFixed(2)} MXN</span>
                        </div>
                    </div>
                    
                    <p>Te mantendremos informado sobre el estado de tu pedido y el envío.</p>
                    <p>Gracias por confiar en <strong>BeztShop</strong>.</p>
                </div>
            </div>
        </body>
        </html>
      `;
    }

    const result = await emailService.sendEmail({
      to: params.email,
      subject,
      html,
      from: 'BeztShop <atencionalcliente@beztshop.com>'
    });

    if (!result.success) {
      throw new Error(`Error enviando email al cliente: ${result.error}`);
    }

    console.log(`✅ Notificación de orden enviada al cliente: ${params.email} (ID: ${result.id})`);
    return result;

  } catch (error: any) {
    console.error('❌ Error enviando notificación al cliente:', {
      error: error.message,
      email: params.email,
      orderNumber: params.orderNumber
    });
    throw error;
  }
}