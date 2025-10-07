// src/controllers/squareController.ts - Controlador para pagos con Square
import { Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import squareService, { CreatePaymentRequest, SquarePaymentResult } from '../services/squareService';
import { AuthenticatedRequest } from '../middleware/auth';

const prisma = new PrismaClient();

// Schemas de validación
const createPaymentSchema = z.object({
  sourceId: z.string().min(1, 'Token de pago requerido').optional(), // Hacer opcional
  useStoredPaymentMethod: z.boolean().optional(), // NUEVO
  paymentMethodId: z.string().optional(),         // NUEVO
  orderId: z.string().min(1, 'ID de pedido requerido'),
  amount: z.number().min(1, 'Monto debe ser mayor a 0'),
  currency: z.string().default('USD'),
  buyerEmail: z.string().email().optional(),
  orderData: z.any().optional(),
  billingAddress: z.object({
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    locality: z.string().optional(),
    administrativeDistrictLevel1: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional()
  }).optional(),
  shippingAddress: z.object({
    addressLine1: z.string().optional(),
    addressLine2: z.string().optional(),
    locality: z.string().optional(),
    administrativeDistrictLevel1: z.string().optional(),
    postalCode: z.string().optional(),
    country: z.string().optional()
  }).optional(),
  verificationToken: z.string().optional()
});

const refundPaymentSchema = z.object({
  paymentId: z.string().min(1, 'ID de pago requerido'),
  amount: z.number().min(1, 'Monto debe ser mayor a 0'),
  reason: z.string().optional()
});

/**
 * Procesar pago con Square
 */
export const processPayment = async (req: AuthenticatedRequest, res: Response) => {
  try {
    console.log('=== SQUARE PAYMENT PROCESSING ===');

    const validation = createPaymentSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos de pago inválidos',
        details: validation.error.issues
      });
    }

    const {
      sourceId,
      amount,
      currency,
      buyerEmail,
      billingAddress,
      shippingAddress,
      verificationToken,
      orderData // NUEVO: Datos del pedido
    } = validation.data;

    // Determinar sourceId final
    let finalSourceId = sourceId;
    
    if (!finalSourceId) {
      return res.status(400).json({
        error: 'Token de pago requerido'
      });
    }

    // PASO 1: Si viene orderData, CREAR el pedido (pero sin stock)
    let order: any = null;
    let createdFromOrderData = false;

    if (orderData) {
      console.log('📝 Creando pedido desde orderData...');
      
      // Obtener productos para calcular totales
      const productIds = orderData.items.map((item: any) => item.productId);
      const products = await prisma.product.findMany({
        where: { id: { in: productIds }, isActive: true }
      });

      // Calcular totales
      let subtotal = 0;
      const orderItems: any[] = [];

      for (const item of orderData.items) {
        const product = products.find(p => p.id === item.productId);
        if (!product) {
          return res.status(400).json({ 
            error: `Producto ${item.productId} no encontrado` 
          });
        }

        const itemTotal = Number(product.price) * item.quantity;
        subtotal += itemTotal;

        orderItems.push({
          productId: product.id,
          productName: product.name,
          quantity: item.quantity,
          price: Number(product.price),
          totalPrice: itemTotal,
          variants: item.variants ? JSON.stringify(item.variants) : null
        });
      }

      // Calcular costos adicionales
      const shippingRates = { standard: 15, express: 25, overnight: 45 };
      const freeShippingThreshold = 100;
let shippingCost = shippingRates[orderData.shippingMethod as keyof typeof shippingRates] || 15;

// ✅ APLICAR ENVÍO GRATIS si subtotal >= $100
if (subtotal >= freeShippingThreshold) {
  shippingCost = 0;  
}
      const tax = subtotal * 0.08;
      const total = subtotal + shippingCost + tax;

      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

      console.log('shippingAddress type:', typeof shippingAddress);
console.log('shippingAddress value:', shippingAddress);
console.log('orderData.shippingAddress:', orderData.shippingAddress);

      // Crear pedido SIN decrementar stock
      order = await prisma.order.create({
        data: {
          orderNumber,
          userId: req.user?.id,
          subtotal,
          taxAmount: tax,
          shippingAmount: shippingCost,
          discountAmount: 0,
          totalAmount: total,
          status: 'PENDING', // Estado inicial
          paymentStatus: 'PENDING',
          paymentMethod: 'card',
          shippingAddress: JSON.stringify(
  orderData.shippingAddress || shippingAddress
), 
          notes: orderData.customerNotes || null,
          items: {
            create: orderItems
          }
        }
      });

      createdFromOrderData = true;
      console.log(`✅ Pedido ${orderNumber} creado (sin decrementar stock)`);
    }

    // Validar monto
    const amountCents = Math.round(amount * 100);
    
    if (process.env.NODE_ENV === 'production' && amountCents < 100) {
      return res.status(400).json({
        error: 'El monto mínimo para pagos es $1.00 USD',
        received: amount
      });
    }

    // PASO 2: Procesar pago con Square
    const paymentData: CreatePaymentRequest = {
      sourceId: finalSourceId,
      amountCents,
      currency: currency.toUpperCase(),
      orderId: order?.orderNumber || 'temp-order',
      buyerEmailAddress: buyerEmail || req.user?.email,
      note: `Pedido - ${orderData?.items.length || 0} producto(s)`,
      verificationToken,
      billingAddress,
      shippingAddress
    };

    console.log('Procesando pago con Square...');
    const paymentResult: SquarePaymentResult = await squareService.createPayment(paymentData);

    // PASO 3A: Si el pago es EXITOSO
    if (paymentResult.success && paymentResult.payment && order) {
      console.log('✅ Pago exitoso, confirmando pedido y decrementando stock...');

      const updatedOrder = await prisma.$transaction(async (tx) => {
        // 1. Actualizar el pedido
        const updated = await tx.order.update({
          where: { id: order.id },
          data: {
            status: 'CONFIRMED',
            paymentStatus: 'PAID',
            paymentMethod: 'card',
            paymentId: paymentResult.transactionId,
            updatedAt: new Date()
          }
        });

        // 2. AHORA SÍ: Decrementar stock (solo si el pago fue exitoso)
        if (createdFromOrderData && orderData) {
          for (const item of orderData.items) {
            await tx.product.update({
              where: { id: item.productId },
              data: {
                stockCount: { decrement: item.quantity },
                salesCount: { increment: item.quantity }
              }
            });
          }
        }

        return updated;
      });

      console.log(`✅ Pedido ${order.orderNumber} confirmado y stock actualizado`);

      return res.status(200).json({
        success: true,
        message: 'Pago procesado exitosamente',
        payment: {
          id: paymentResult.transactionId,
          status: 'completed',
          amount: amount,
          currency: currency.toUpperCase(),
          receiptUrl: paymentResult.receiptUrl
        },
        order: {
          id: updatedOrder.id,
          orderNumber: updatedOrder.orderNumber,
          status: updatedOrder.status,
          paymentStatus: updatedOrder.paymentStatus,
          total: Number(updatedOrder.totalAmount)
        }
      });
    } 
    
    // PASO 3B: Si el pago FALLA
    else {
      console.log('❌ Pago fallido');

      // Si creamos el pedido, ELIMINARLO
      if (createdFromOrderData && order) {
        await prisma.order.delete({
          where: { id: order.id }
        });
        console.log(`🗑️ Pedido ${order.orderNumber} eliminado (pago fallido)`);
      }

      return res.status(400).json({
        success: false,
        error: paymentResult.error || 'Error procesando el pago',
        userMessage: paymentResult.error,
        details: paymentResult.details || null,
        shouldRetry: paymentResult.details?.shouldRetry !== false,
        payment: null
      });
    }

  } catch (error: any) {
    console.error('Error en processPayment:', error);

    res.status(500).json({
      success: false,
      error: 'Error interno del servidor',
      userMessage: 'Ocurrió un error técnico. Por favor intenta nuevamente o contacta al soporte.',
      details: process.env.NODE_ENV === 'development' ? {
        originalError: error.message,
        stack: error.stack
      } : null,
      shouldRetry: true
    });
  }
};

/**
 * Obtener información de un pago
 */
export const getPaymentInfo = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { paymentId } = req.params;

    if (!paymentId) {
      return res.status(400).json({
        error: 'ID de pago requerido'
      });
    }

    const payment = await squareService.getPayment(paymentId);

    res.json({
      payment: {
        id: payment?.id,
        status: payment?.status,
        amount: payment?.amountMoney,
        createdAt: payment?.createdAt,
        updatedAt: payment?.updatedAt,
        receiptUrl: payment?.receiptUrl
      }
    });

  } catch (error: any) {
    console.error('Error obteniendo información del pago:', error);
    res.status(500).json({
      error: 'Error obteniendo información del pago'
    });
  }
};

/**
 * Procesar reembolso
 */
export const processRefund = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validation = refundPaymentSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos de reembolso inválidos',
        details: validation.error.issues
      });
    }

    const { paymentId, amount, reason } = validation.data;

    // Verificar que el pago existe en nuestra base de datos
    const order = await prisma.order.findFirst({
      where: {
        paymentId,
        paymentStatus: 'PAID'
      }
    });

    if (!order) {
      return res.status(404).json({
        error: 'Pago no encontrado o no elegible para reembolso'
      });
    }

    // Verificar permisos (solo admin o el usuario propietario)
    if (req.user?.role !== 'ADMIN' && req.user?.id !== order.userId) {
      return res.status(403).json({
        error: 'No tienes permisos para realizar este reembolso'
      });
    }

    const amountCents = Math.round(amount * 100);

    console.log(`Procesando reembolso de ${amountCents} centavos para pago ${paymentId}`);

    // Procesar reembolso con Square
    const refund = await squareService.refundPayment(paymentId, amountCents, reason);

    // Actualizar el pedido
    const isFullRefund = amountCents >= Math.round(Number(order.totalAmount) * 100);
    
    await prisma.order.update({
      where: { id: order.id },
      data: {
        paymentStatus: isFullRefund ? 'REFUNDED' : 'PARTIALLY_REFUNDED',
        status: isFullRefund ? 'REFUNDED' : order.status,
        notes: `${order.notes || ''}\nReembolso: ${reason || 'Sin razón especificada'}`.trim(),
        refundedAt: isFullRefund ? new Date() : order.refundedAt,
        updatedAt: new Date()
      }
    });

    console.log(`Reembolso procesado exitosamente para pedido ${order.orderNumber}`);

    res.json({
      success: true,
      message: 'Reembolso procesado exitosamente',
      refund: {
        id: refund?.id,
        status: refund?.status,
        amount: refund?.amountMoney,
        reason: refund?.reason,
        createdAt: refund?.createdAt
      }
    });

  } catch (error: any) {
    console.error('Error procesando reembolso:', error);
    res.status(500).json({
      error: 'Error procesando el reembolso'
    });
  }
};

/**
 * Obtener configuración de Square para el frontend
 */
export const getSquareConfig = async (req: Request, res: Response) => {
  try {
    // Validar configuración
    const config = await squareService.validateConfiguration();

    if (!config.valid) {
      return res.status(500).json({
        error: 'Configuración de Square inválida',
        details: config.error
      });
    }

    res.json({
      applicationId: process.env.SQUARE_APPLICATION_ID,
      locationId: process.env.SQUARE_LOCATION_ID,
      environment: config.environment,
      sandbox: config.environment === 'sandbox'
    });

  } catch (error: any) {
    console.error('Error obteniendo configuración Square:', error);
    res.status(500).json({
      error: 'Error obteniendo configuración de pagos'
    });
  }
};

/**
 * Webhook para notificaciones de Square (opcional)
 */
export const squareWebhook = async (req: Request, res: Response) => {
  try {
    console.log('Square webhook recibido:', req.body);

    // Aquí puedes procesar notificaciones de Square
    // Por ejemplo: confirmación de pagos, reembolsos, etc.
    
    const { type, data } = req.body;

    switch (type) {
      case 'payment.updated':
        console.log('Pago actualizado:', data);
        // Actualizar estado del pago en base de datos
        break;
        
      case 'refund.updated':
        console.log('Reembolso actualizado:', data);
        // Actualizar estado del reembolso
        break;
        
      default:
        console.log('Evento webhook no manejado:', type);
    }

    // Square espera una respuesta 200
    res.status(200).json({ received: true });

  } catch (error: any) {
    console.error('Error procesando webhook Square:', error);
    res.status(500).json({ error: 'Error procesando webhook' });
  }
};

/**
 * Health check para Square
 */
export const squareHealthCheck = async (req: Request, res: Response) => {
  try {
    const config = await squareService.validateConfiguration();
    
    res.json({
      status: config.valid ? 'OK' : 'ERROR',
      square: {
        configured: config.valid,
        environment: config.environment,
        locationsCount: config.locationsCount,
        error: config.error
      },
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    console.error('Error en health check Square:', error);
    res.status(500).json({
      status: 'ERROR',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
};