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
      <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: 'Inter', -apple-system, sans-serif; margin: 0; padding: 0; background: #1F1F1F;">
          <div style="padding: 20px;">
              <div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1F1F1F 0%, #2A2A2A 100%); border-radius: 12px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.5);">
                  
                  <!-- Header -->
                  <div style="background: linear-gradient(135deg, #FFD700 0%, #00CED1 100%); padding: 30px; text-align: center; position: relative;">
                      <div style="font-size: 64px; margin-bottom: 10px;">🎉</div>
                      <h1 style="color: #1F1F1F; margin: 0; font-size: 28px; font-weight: 900; text-shadow: 2px 2px 4px rgba(0,0,0,0.2);">
                          Nueva Orden Recibida
                      </h1>
                      <p style="color: #1F1F1F; margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">
                          BeztShop Admin Panel
                      </p>
                  </div>
                  
                  <!-- Content -->
                  <div style="padding: 40px 30px;">
                      <h2 style="color: #FFD700; margin: 0 0 20px 0; font-size: 22px;">
                          Pedido #${orderData.orderNumber}
                      </h2>
                      
                      <!-- Order Details Card -->
                      <div style="background: #2A2A2A; border: 1px solid rgba(255,215,0,0.2); border-radius: 8px; padding: 25px; margin: 20px 0;">
                          <div style="display: table; width: 100%;">
                              <div style="display: table-row;">
                                  <div style="display: table-cell; padding: 10px 0; color: #9CA3AF; font-size: 14px;">Cliente:</div>
                                  <div style="display: table-cell; padding: 10px 0; color: #FFFFFF; font-weight: bold; text-align: right;">${orderData.customerName}</div>
                              </div>
                              <div style="display: table-row;">
                                  <div style="display: table-cell; padding: 10px 0; color: #9CA3AF; font-size: 14px;">Email:</div>
                                  <div style="display: table-cell; padding: 10px 0; color: #00CED1; text-align: right;">${orderData.customerEmail}</div>
                              </div>
                              <div style="display: table-row;">
                                  <div style="display: table-cell; padding: 10px 0; color: #9CA3AF; font-size: 14px;">Total:</div>
                                  <div style="display: table-cell; padding: 10px 0; color: #FFD700; font-weight: bold; font-size: 18px; text-align: right;">$${orderData.total.toFixed(2)} MXN</div>
                              </div>
                              <div style="display: table-row;">
                                  <div style="display: table-cell; padding: 10px 0; color: #9CA3AF; font-size: 14px;">Método de pago:</div>
                                  <div style="display: table-cell; padding: 10px 0; color: #FFFFFF; text-align: right;">${orderData.paymentMethod}</div>
                              </div>
                              <div style="display: table-row;">
                                  <div style="display: table-cell; padding: 10px 0; color: #9CA3AF; font-size: 14px;">Productos:</div>
                                  <div style="display: table-cell; padding: 10px 0; color: #FFFFFF; text-align: right;">${orderData.itemsCount} artículo(s)</div>
                              </div>
                          </div>
                          
                          <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid rgba(255,215,0,0.1);">
                              <div style="background: #10B981; color: white; padding: 10px 15px; border-radius: 6px; text-align: center; font-weight: bold;">
                                  ✅ PAGADO - Stripe
                              </div>
                          </div>
                      </div>
                      
                      <!-- Success Message -->
                      <div style="background: rgba(16,185,129,0.1); border: 1px solid rgba(16,185,129,0.3); border-radius: 8px; padding: 15px; margin-top: 20px;">
                          <p style="margin: 0; color: #10B981; font-size: 14px; text-align: center;">
                              ✅ <strong>El pago fue procesado exitosamente</strong>
                          </p>
                      </div>
                      
                      <!-- CTA -->
                      <div style="text-align: center; margin: 30px 0;">
                          <a href="${process.env.FRONTEND_URL}/admin/orders" 
                             style="display: inline-block; background: linear-gradient(135deg, #FFD700 0%, #00CED1 100%); color: #1F1F1F; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 15px rgba(255,215,0,0.4);">
                              Ver Detalles de la Orden
                          </a>
                      </div>
                  </div>
                  
                  <!-- Footer -->
                  <div style="background: #2A2A2A; padding: 20px; text-align: center; border-top: 1px solid rgba(255,215,0,0.1);">
                      <p style="color: #6B7280; font-size: 12px; margin: 0;">
                          Notificación automática de BeztShop Admin Panel<br>
                          © 2025 BeztShop. Tech Store Premium.
                      </p>
                  </div>
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
  items: Array<{productName: string; quantity: number; price: number; productSlug?: string}>;
  paymentMethod: string;
}) => {
  try {
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: 'Inter', -apple-system, sans-serif; margin: 0; padding: 0; background: #1F1F1F;">
          <div style="padding: 20px;">
              <div style="max-width: 600px; margin: 0 auto; background: linear-gradient(135deg, #1F1F1F 0%, #2A2A2A 100%); border-radius: 12px; overflow: hidden; box-shadow: 0 10px 40px rgba(0,0,0,0.5);">
                  
                  <!-- Header -->
                  <div style="background: linear-gradient(135deg, #FFD700 0%, #00CED1 100%); padding: 40px 30px; text-align: center; position: relative;">
                      <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: url('data:image/svg+xml,<svg width=\"100\" height=\"100\" xmlns=\"http://www.w3.org/2000/svg\"><defs><pattern id=\"grid\" width=\"20\" height=\"20\" patternUnits=\"userSpaceOnUse\"><path d=\"M 20 0 L 0 0 0 20\" fill=\"none\" stroke=\"rgba(255,255,255,0.1)\" stroke-width=\"1\"/></pattern></defs><rect width=\"100\" height=\"100\" fill=\"url(%23grid)\"/></svg>'); opacity: 0.3;"></div>
                      <div style="position: relative; z-index: 1;">
                          <div style="font-size: 64px; margin-bottom: 10px;">✅</div>
                          <h1 style="color: #1F1F1F; margin: 0; font-size: 32px; font-weight: 900; text-shadow: 2px 2px 4px rgba(0,0,0,0.2);">
                              ¡Pedido Confirmado!
                          </h1>
                          <p style="color: #1F1F1F; margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">
                              Tu compra fue procesada exitosamente
                          </p>
                      </div>
                  </div>
                  
                  <!-- Content -->
                  <div style="padding: 40px 30px;">
                      <p style="color: #FFFFFF; font-size: 18px; margin: 0 0 10px 0;">
                          Hola <strong style="color: #FFD700;">${params.customerName}</strong>,
                      </p>
                      
                      <p style="color: #9CA3AF; font-size: 16px;">
                          ¡Gracias por tu compra! Tu pedido <strong style="color: #00CED1;">#${params.orderNumber}</strong> ha sido confirmado y pagado.
                      </p>
                      
                      <!-- Order Summary Card -->
                      <div style="background: #2A2A2A; border: 1px solid rgba(255,215,0,0.2); border-radius: 8px; padding: 25px; margin: 25px 0;">
                          <h3 style="color: #FFD700; margin: 0 0 20px 0; font-size: 18px; border-bottom: 2px solid rgba(255,215,0,0.2); padding-bottom: 10px;">
                              📦 Resumen del Pedido
                          </h3>
                          
                          ${params.items.map(item => `
                              <div style="display: table; width: 100%; padding: 12px 0; border-bottom: 1px solid rgba(255,215,0,0.1);">
                                  <div style="display: table-cell; vertical-align: top;">
                                      <p style="margin: 0; color: #FFFFFF; font-size: 15px;">
                                          ${item.productName}
                                      </p>
                                      <p style="margin: 5px 0 0 0; color: #9CA3AF; font-size: 13px;">
                                          Cantidad: ${item.quantity}
                                      </p>
                                  </div>
                                  <div style="display: table-cell; vertical-align: top; text-align: right;">
                                      <p style="margin: 0; color: #00CED1; font-size: 16px; font-weight: bold;">
                                          $${(item.price * item.quantity).toFixed(2)}
                                      </p>
                                  </div>
                              </div>
                          `).join('')}
                          
                          <div style="display: table; width: 100%; padding: 20px 0 0 0; margin-top: 15px; border-top: 2px solid #FFD700;">
                              <div style="display: table-cell; vertical-align: middle;">
                                  <p style="margin: 0; color: #FFFFFF; font-size: 20px; font-weight: bold;">Total Pagado:</p>
                              </div>
                              <div style="display: table-cell; vertical-align: middle; text-align: right;">
                                  <p style="margin: 0; background: linear-gradient(135deg, #FFD700 0%, #00CED1 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; font-size: 24px; font-weight: bold;">
                                      $${params.total.toFixed(2)} MXN
                                  </p>
                              </div>
                          </div>
                      </div>
                      
                      <!-- Payment Confirmation -->
                      <div style="background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3); border-radius: 8px; padding: 15px; margin: 20px 0;">
                          <p style="margin: 0; color: #3B82F6; font-size: 14px; text-align: center;">
                              ✅ <strong>Pago confirmado</strong> - Tu pago fue procesado exitosamente con ${params.paymentMethod}
                          </p>
                      </div>
                      
                      <!-- Next Steps -->
                      <div style="background: #2A2A2A; border-radius: 8px; padding: 20px; margin: 20px 0;">
                          <h3 style="color: #00CED1; margin: 0 0 15px 0; font-size: 16px;">
                              🚀 Próximos pasos:
                          </h3>
                          <ul style="margin: 0; padding-left: 20px; color: #9CA3AF; font-size: 14px; line-height: 1.8;">
                              <li>Estamos preparando tu pedido con cuidado</li>
                              <li>Recibirás un email cuando sea enviado</li>
                              <li>Podrás rastrear tu envío en tiempo real</li>
                              <li>Entrega estimada: 3-7 días hábiles</li>
                          </ul>
                      </div>
                      
                      <!-- Track Order Button -->
                      <div style="text-align: center; margin: 30px 0;">
                          <a href="${process.env.FRONTEND_URL}/account/orders" 
                             style="display: inline-block; background: linear-gradient(135deg, #FFD700 0%, #00CED1 100%); color: #1F1F1F; padding: 16px 32px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; box-shadow: 0 4px 15px rgba(255,215,0,0.4);">
                              🔍 Rastrear mi Pedido
                          </a>
                      </div>
                      
                      <!-- Review Section - NUEVO -->
                      <div style="background: linear-gradient(135deg, rgba(255,215,0,0.1) 0%, rgba(0,206,209,0.1) 100%); border: 2px solid rgba(255,215,0,0.3); border-radius: 12px; padding: 25px; margin: 30px 0;">
                          <div style="text-align: center; margin-bottom: 20px;">
                              <div style="font-size: 48px; margin-bottom: 10px;">⭐</div>
                              <h3 style="color: #FFD700; margin: 0 0 10px 0; font-size: 20px; font-weight: bold;">
                                  ¿Qué te pareció tu compra?
                              </h3>
                              <p style="color: #9CA3AF; font-size: 14px; margin: 0;">
                                  Tu opinión nos ayuda a mejorar y ayuda a otros clientes a decidir
                              </p>
                          </div>
                          
                          <div style="background: #2A2A2A; border-radius: 8px; padding: 20px; margin-top: 20px;">
                              <p style="color: #00CED1; font-size: 14px; margin: 0 0 15px 0; text-align: center;">
                                  💬 <strong>Califica los productos que compraste:</strong>
                              </p>
                              
                              ${params.items.slice(0, 3).map(item => `
                                  <div style="margin: 10px 0;">
                                      <a href="${process.env.FRONTEND_URL}/products/${item.productSlug || ''}#reviews" 
                                         style="display: block; background: rgba(255,215,0,0.1); border: 1px solid rgba(255,215,0,0.2); border-radius: 6px; padding: 12px 15px; text-decoration: none; transition: all 0.2s;">
                                          <div style="display: table; width: 100%;">
                                              <div style="display: table-cell; vertical-align: middle;">
                                                  <span style="color: #FFFFFF; font-size: 14px;">⭐ ${item.productName}</span>
                                              </div>
                                              <div style="display: table-cell; vertical-align: middle; text-align: right;">
                                                  <span style="color: #FFD700; font-size: 12px; font-weight: bold;">Calificar →</span>
                                              </div>
                                          </div>
                                      </a>
                                  </div>
                              `).join('')}
                              
                              ${params.items.length > 3 ? `
                                  <p style="color: #6B7280; font-size: 12px; text-align: center; margin: 15px 0 0 0;">
                                      Y ${params.items.length - 3} producto(s) más en tu cuenta
                                  </p>
                              ` : ''}
                          </div>
                          
                          <div style="text-align: center; margin-top: 20px;">
                              <p style="color: #9CA3AF; font-size: 12px; margin: 0;">
                                  🎁 <strong style="color: #FFD700;">¡Gana puntos!</strong> Cada reseña te da descuentos para futuras compras
                              </p>
                          </div>
                      </div>
                      
                      <!-- Support -->
                      <div style="background: rgba(0,206,209,0.1); border: 1px solid rgba(0,206,209,0.3); border-radius: 8px; padding: 15px; text-align: center; margin-top: 20px;">
                          <p style="margin: 0; color: #00CED1; font-size: 14px;">
                              💬 <strong>¿Necesitas ayuda?</strong> Nuestro equipo está disponible 24/7<br>
                              <a href="mailto:soporte@beztshop.com" style="color: #FFD700; text-decoration: none; font-weight: bold;">soporte@beztshop.com</a>
                          </p>
                      </div>
                  </div>
                  
                  <!-- Footer -->
                  <div style="background: #2A2A2A; padding: 30px; text-align: center; border-top: 1px solid rgba(255,215,0,0.1);">
                      <p style="color: #9CA3AF; font-size: 14px; margin: 0 0 15px 0;">
                          Gracias por confiar en <strong style="color: #FFD700;">BeztShop</strong>
                      </p>
                      
                      <div style="margin: 20px 0;">
                          <a href="${process.env.FRONTEND_URL}" style="color: #00CED1; text-decoration: none; margin: 0 10px; font-size: 14px;">Inicio</a>
                          <span style="color: #6B7280;">•</span>
                          <a href="${process.env.FRONTEND_URL}/products" style="color: #00CED1; text-decoration: none; margin: 0 10px; font-size: 14px;">Productos</a>
                          <span style="color: #6B7280;">•</span>
                          <a href="${process.env.FRONTEND_URL}/account" style="color: #00CED1; text-decoration: none; margin: 0 10px; font-size: 14px;">Mi Cuenta</a>
                      </div>
                      
                      <p style="color: #6B7280; font-size: 12px; margin: 20px 0 0 0;">
                          © 2025 BeztShop. Tech Store Premium. Todos los derechos reservados.
                      </p>
                  </div>
              </div>
          </div>
      </body>
      </html>
    `;

    await emailService.sendEmail({
      to: params.email,
      subject: `✅ Pedido Confirmado #${params.orderNumber} - BeztShop`,
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
    const freeShippingThreshold = 299;

// Calcular peso total
let totalWeight = 0;
for (const item of orderItems) {
  const product = products.find(p => p.id === item.productId);
  if (product && product.weight) {
    totalWeight += Number(product.weight) * item.quantity;
  }
}

if (totalWeight === 0) {
  totalWeight = orderItems.reduce((sum, item) => sum + item.quantity, 0) * 0.5;
}

// Calcular costo de envío
let shippingCost = 0;
if (subtotal >= freeShippingThreshold) {
  shippingCost = 0;
} else {
  if (totalWeight <= 1) {
    shippingCost = 70;
  } else if (totalWeight <= 3) {
    shippingCost = 80;
  } else if (totalWeight <= 5) {
    shippingCost = 90;
  } else if (totalWeight <= 10) {
    shippingCost = 95;
  } else {
    shippingCost = 150 + ((totalWeight - 10) * 15);
  }
  shippingCost = Math.min(shippingCost, 250);
}

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

    const tax = 0;
    const total = subtotal - discount + shippingCost;

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
  items: orderItems.map(item => {
    // Buscar el producto para obtener su slug
    const product = products.find(p => p.id === item.productId);
    return {
      productName: item.productName,
      quantity: item.quantity,
      price: item.price,
      productSlug: product?.slug || '' // ← AGREGAR ESTO
    };
  }),
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