import { Router } from 'express';
import type { Response } from 'express';
import { authenticateToken } from '../middleware/auth';
import type { AuthenticatedRequest } from '../middleware/auth';
import stripeService from '../services/stripeService';
import { PrismaClient } from '@prisma/client';
import { emailService } from '../services/emailService';

const router = Router();
const prisma = new PrismaClient();

interface OrderItemData {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  totalPrice: number;
  variants: any;
}

// Función para notificar al admin
const sendAdminOrderNotification = async (orderData: {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  total: number;
  paymentMethod: string;
  itemsCount: number;
}) => {
  try {
    const adminEmail = 'atencionalcliente@gmail.com';
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: #10b981; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                  <h2 style="margin: 0;">🎉 Nueva Orden Recibida</h2>
              </div>
              <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
                  <h3>Pedido #${orderData.orderNumber}</h3>
                  <div style="background: white; padding: 20px; border-radius: 8px; margin: 15px 0;">
                      <p><strong>Cliente:</strong> ${orderData.customerName}</p>
                      <p><strong>Email:</strong> ${orderData.customerEmail}</p>
                      <p><strong>Total:</strong> $${orderData.total.toFixed(2)} USD</p>
                      <p><strong>Método de pago:</strong> ${orderData.paymentMethod}</p>
                      <p><strong>Productos:</strong> ${orderData.itemsCount} artículo(s)</p>
                      <p><strong>Estado:</strong> <span style="background: #10b981; color: white; padding: 4px 8px; border-radius: 4px;">PAGADO</span></p>
                  </div>
                  <p style="color: #059669; font-weight: bold;">✅ El pago fue procesado exitosamente con Stripe</p>
              </div>
          </div>
      </body>
      </html>
    `;

    await emailService.sendEmail({
      to: adminEmail,
      subject: `🔔 Nueva Orden #${orderData.orderNumber} - Pagada`,
      html,
      from: 'BeztShop <atencionalcliente@beztshop.com>'
    });

    console.log('✅ Notificación enviada al admin');
  } catch (error: any) {
    console.error('❌ Error enviando notificación al admin:', error.message);
  }
};

// Función para notificar al cliente
const sendCustomerOrderNotification = async (params: {
  email: string;
  customerName: string;
  orderNumber: string;
  total: number;
  items: Array<{productName: string; quantity: number; price: number}>;
  paymentMethod: string;
}) => {
  try {
    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"></head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: #10b981; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                  <h2 style="margin: 0;">✅ ¡Pedido Confirmado!</h2>
                  <p style="margin: 5px 0 0 0; opacity: 0.9;">Tu compra ha sido procesada exitosamente</p>
              </div>
              <div style="background: #f0fdf4; padding: 30px; border-radius: 0 0 8px 8px;">
                  <p>Hola <strong>${params.customerName}</strong>,</p>
                  <p>¡Gracias por tu compra! Tu pedido <strong>#${params.orderNumber}</strong> ha sido confirmado y pagado.</p>
                  
                  <div style="background: white; padding: 25px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
                      <h3 style="margin-top: 0;">Resumen del Pedido:</h3>
                      ${params.items.map(item => `
                          <div style="display: flex; justify-content: space-between; margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                              <span>${item.productName} (x${item.quantity})</span>
                              <span style="color: #059669; font-weight: bold;">$${(item.price * item.quantity).toFixed(2)}</span>
                          </div>
                      `).join('')}
                      <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 18px; margin-top: 20px; padding-top: 15px; border-top: 2px solid #10b981; color: #10b981;">
                          <span>Total Pagado:</span>
                          <span>$${params.total.toFixed(2)} MXN</span>
                      </div>
                  </div>
                  
                  <div style="background: #dbeafe; border: 1px solid #3b82f6; padding: 15px; border-radius: 8px; margin: 20px 0;">
                      <p style="margin: 0; color: #1e40af;">
                          <strong>✅ Pago confirmado</strong> - Tu pago fue procesado exitosamente con ${params.paymentMethod}
                      </p>
                  </div>
                  
                  <p>Te mantendremos informado sobre el estado de tu pedido y te notificaremos cuando sea enviado.</p>
                  <p>Gracias por confiar en <strong>BeztShop</strong>.</p>
              </div>
          </div>
      </body>
      </html>
    `;

    await emailService.sendEmail({
      to: params.email,
      subject: `✅ Pedido Confirmado #${params.orderNumber}`,
      html,
      from: 'BeztShop <atencionalcliente@beztshop.com>'
    });

    console.log('✅ Notificación enviada al cliente:', params.email);
  } catch (error: any) {
    console.error('❌ Error enviando notificación al cliente:', error.message);
  }
};

// Crear Payment Intent
router.post('/create-payment-intent', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { amount, currency } = req.body;

    if (!amount || !currency) {
      return res.status(400).json({ error: 'Datos requeridos faltantes' });
    }

    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    console.log('💳 Creando Payment Intent para:', user.email);
    
    const result = await stripeService.createPaymentIntent({
      amount,
      currency,
      orderId: `temp-${Date.now()}`,
      customerEmail: user.email,
      metadata: { userId: user.id }
    });

    console.log('✅ Payment Intent creado');
    res.json(result);
    
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    res.status(500).json({ error: error.message || 'Error interno' });
  }
});

// Confirmar pago y crear orden
router.post('/confirm-payment', authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { paymentIntentId, orderData } = req.body;

    if (!paymentIntentId || !orderData) {
      return res.status(400).json({ error: 'Datos requeridos faltantes' });
    }

    const user = req.user;
    if (!user) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }

    console.log('🔄 Confirmando pago...');

    // Confirmar pago en Stripe
    const paymentResult = await stripeService.confirmPayment(paymentIntentId);
    if (!paymentResult.success) {
      return res.status(400).json({
        success: false,
        error: 'El pago no fue exitoso',
        status: paymentResult.status
      });
    }

    // Obtener productos
    const productIds = orderData.items.map((item: any) => item.productId);
    const products = await prisma.product.findMany({
      where: { id: { in: productIds }, isActive: true }
    });

    // Calcular totales
    let subtotal = 0;
    const orderItems: OrderItemData[] = [];

    for (const item of orderData.items) {
      const product = products.find(p => p.id === item.productId);
      if (!product) {
        throw new Error(`Producto ${item.productId} no encontrado`);
      }
      if (product.trackInventory && product.stockCount < item.quantity) {
        throw new Error(`Stock insuficiente para ${product.name}`);
      }

      const itemTotal = Number(product.price) * item.quantity;
      subtotal += itemTotal;

      orderItems.push({
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        price: Number(product.price),
        totalPrice: itemTotal,
        variants: item.variants || null
      });
    }

    // Calcular envío
    const shippingRates: { [key: string]: number } = {
      standard: 15,
      express: 25,
      overnight: 45
    };
    
    let shippingCost = shippingRates[orderData.shippingMethod] || 15;
    if (subtotal >= 100) shippingCost = 0;

    // Aplicar cupón
    let discount = 0;
    let appliedCoupon = null;

    if (orderData.couponCode) {
      const coupon = await prisma.coupon.findFirst({
        where: {
          code: orderData.couponCode.toUpperCase(),
          isActive: true,
          OR: [
            { expiresAt: null },
            { expiresAt: { gte: new Date() } }
          ]
        }
      });

      if (coupon) {
        const minAmount = coupon.minAmount ? Number(coupon.minAmount) : 0;
        if (subtotal >= minAmount) {
          switch (coupon.type) {
            case 'PERCENTAGE':
              discount = (subtotal * Number(coupon.value)) / 100;
              if (coupon.maxDiscount) {
                discount = Math.min(discount, Number(coupon.maxDiscount));
              }
              break;
            case 'FIXED_AMOUNT':
              discount = Number(coupon.value);
              break;
            case 'FREE_SHIPPING':
              shippingCost = 0;
              break;
          }
          appliedCoupon = coupon;
        }
      }
    }

    const tax = (subtotal - discount) * 0.08;
    const total = subtotal - discount + shippingCost + tax;

    // Obtener detalles de la tarjeta usada
    const paymentMethodDetails = await stripeService.getPaymentMethod(paymentIntentId);
    const paymentMethodText = paymentMethodDetails?.card 
  ? `${paymentMethodDetails.card.brand.toUpperCase()} ****${paymentMethodDetails.card.last4}`
  : 'Tarjeta';

    // Crear orden
    const order = await prisma.$transaction(async (tx) => {
      const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          userId: user.id,
          subtotal,
          taxAmount: tax,
          shippingAmount: shippingCost,
          discountAmount: discount,
          totalAmount: total,
          status: 'CONFIRMED',
          paymentStatus: 'PAID',
          paymentMethod: paymentMethodText,
          paymentId: paymentIntentId,
          shippingAddress: JSON.stringify(orderData.shippingAddress),
          notes: orderData.customerNotes || null
        }
      });

      for (const item of orderItems) {
        await tx.orderItem.create({
          data: {
            orderId: newOrder.id,
            productId: item.productId,
            productName: item.productName,
            quantity: item.quantity,
            price: item.price,
            totalPrice: item.totalPrice,
            variants: item.variants ? JSON.stringify(item.variants) : undefined
          }
        });
      }

      for (const item of orderData.items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stockCount: { decrement: item.quantity },
            salesCount: { increment: item.quantity }
          }
        });
      }

      if (appliedCoupon) {
        await tx.coupon.update({
          where: { id: appliedCoupon.id },
          data: { usageCount: { increment: 1 } }
        });
      }

      return newOrder;
    });

    console.log(`✅ Orden creada: ${order.orderNumber}`);

    //Enviar notificaciones por email (sin bloquear la respuesta)
try {
  // 👇 OBTENER USUARIO COMPLETO DE LA BASE DE DATOS
  const fullUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      firstName: true,
      lastName: true,
      email: true
    }
  });

  const customerName = fullUser 
    ? `${fullUser.firstName} ${fullUser.lastName}`
    : user.email; // Fallback al email si no se encuentra el usuario
  
  // Notificación al cliente
  await sendCustomerOrderNotification({
    email: user.email,
    customerName,
    orderNumber: order.orderNumber,
    total: Number(order.totalAmount),
    items: orderItems.map(item => ({
      productName: item.productName,
      quantity: item.quantity,
      price: item.price
    })),
    paymentMethod: paymentMethodText
  });

  // Notificación al admin
  await sendAdminOrderNotification({
    orderNumber: order.orderNumber,
    customerName,
    customerEmail: user.email,
    total: Number(order.totalAmount),
    paymentMethod: paymentMethodText,
    itemsCount: orderItems.length
  });

  console.log('✅ Notificaciones enviadas correctamente');
} catch (emailError: any) {
  // No fallar la orden si hay error en emails
  console.error('⚠️ Error enviando notificaciones (no crítico):', emailError.message);
}

    res.json({
      success: true,
      message: 'Pago procesado exitosamente',
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: order.status,
        paymentStatus: order.paymentStatus,
        total: Number(order.totalAmount)
      },
      redirectUrl: `/account/orders/${order.id}`
    });

  } catch (error: any) {
    console.error('❌ Error:', error);
    res.status(500).json({ error: error.message || 'Error interno' });
  }
});

export default router;