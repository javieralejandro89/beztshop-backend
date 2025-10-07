// src/controllers/checkoutController.ts - Controlador de checkout corregido
import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import { emailService } from '../services/emailService';

const prisma = new PrismaClient();

// ✅ IMPORTAR FUNCIONES DE NOTIFICACIÓN
const sendAdminOrderNotification = async (orderData: {
  orderNumber: string;
  customerName: string;
  customerEmail: string;
  total: number;
  paymentMethod: string;
  status: string;
  itemsCount: number;
  shippingAddress: any;
}) => {
  try {
    const adminEmail = 'contacto@serviprogarcia.com';
    
    const paymentStatusBadge = orderData.paymentMethod === 'zelle' 
      ? '<span style="background: #fbbf24; color: #92400e; padding: 4px 8px; border-radius: 4px; font-size: 12px;">ZELLE - PENDIENTE</span>'
      : '<span style="background: #10b981; color: white; padding: 4px 8px; border-radius: 4px; font-size: 12px;">PENDIENTE PAGO</span>';

    const html = `
      <!DOCTYPE html>
      <html>
      <head><meta charset="utf-8"><title>Nueva Orden Creada</title></head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: #dc2626; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                  <h2 style="margin: 0;">🔔 Nueva Orden Creada</h2>
              </div>
              <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
                  <h3>Pedido #${orderData.orderNumber}</h3>
                  <div style="background: white; padding: 20px; border-radius: 8px;">
                      <p><strong>Cliente:</strong> ${orderData.customerName}</p>
                      <p><strong>Email:</strong> ${orderData.customerEmail}</p>
                      <p><strong>Total:</strong> $${orderData.total.toFixed(2)} USD</p>
                      <p><strong>Método:</strong> ${orderData.paymentMethod.toUpperCase()} ${paymentStatusBadge}</p>
                      <p><strong>Items:</strong> ${orderData.itemsCount} producto(s)</p>
                  </div>
                  ${orderData.paymentMethod === 'zelle' ? `
                      <div style="background: #fef3c7; border: 1px solid #fbbf24; padding: 15px; border-radius: 8px; margin-top: 15px;">
                          <h4 style="color: #92400e; margin: 0;">⚠️ Pago Zelle Pendiente</h4>
                          <p style="margin: 5px 0 0 0; color: #92400e;">Requiere confirmación manual.</p>
                      </div>
                  ` : ''}
              </div>
          </div>
      </body>
      </html>
    `;

    return await emailService.sendEmail({
      to: adminEmail,
      subject: `🔔 Nueva Orden #${orderData.orderNumber} - ${orderData.paymentMethod.toUpperCase()}`,
      html,
      from: 'ServiPro Garcia Sistema <contacto@serviprogarcia.com>'
    });

  } catch (error: any) {
    console.error('❌ Error enviando notificación al admin:', error.message);
    throw error;
  }
};

const sendCustomerOrderNotification = async (params: {
  email: string;
  customerName: string;
  orderNumber: string;
  total: number;
  items: Array<{productName: string; quantity: number; price: number}>;
  paymentMethod: string;
  isZelle?: boolean;
}) => {
  try {
    let subject, html;

    if (params.isZelle) {
      subject = `Pedido Recibido #${params.orderNumber} - Pendiente Confirmación Zelle`;
      html = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><title>Pedido Recibido</title></head>
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
                        <p style="color: #92400e; margin-bottom: 0;">Te contactaremos pronto con las instrucciones para completar el pago por Zelle.</p>
                    </div>
                    <div style="background: white; padding: 25px; border-radius: 8px; margin: 20px 0;">
                        <h3 style="margin-top: 0;">Resumen del Pedido:</h3>
                        ${params.items.map(item => `
                            <div style="display: flex; justify-content: space-between; margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                                <span>${item.productName} (x${item.quantity})</span>
                                <span style="color: #059669;">$${(item.price * item.quantity).toFixed(2)}</span>
                            </div>
                        `).join('')}
                        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 18px; margin-top: 20px; padding-top: 15px; border-top: 2px solid #2563eb; color: #2563eb;">
                            <span>Total:</span>
                            <span>$${params.total.toFixed(2)} USD</span>
                        </div>
                    </div>
                    <p>Gracias por confiar en <strong>ServiPro Garcia LLC</strong>.</p>
                </div>
            </div>
        </body>
        </html>
      `;
    } else {
      subject = `¡Pedido Confirmado! #${params.orderNumber}`;
      html = `
        <!DOCTYPE html>
        <html>
        <head><meta charset="utf-8"><title>Pedido Confirmado</title></head>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: #10b981; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center;">
                    <h2 style="margin: 0;">✅ ¡Pedido Confirmado!</h2>
                    <p style="margin: 5px 0 0 0; opacity: 0.9;">Tu compra ha sido procesada exitosamente</p>
                </div>
                <div style="background: #f0fdf4; padding: 30px; border-radius: 0 0 8px 8px;">
                    <p>Hola <strong>${params.customerName}</strong>,</p>
                    <p>¡Gracias por tu compra! Tu pedido <strong>#${params.orderNumber}</strong> ha sido confirmado.</p>
                    <div style="background: white; padding: 25px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981;">
                        <h3 style="margin-top: 0;">Resumen del Pedido:</h3>
                        ${params.items.map(item => `
                            <div style="display: flex; justify-content: space-between; margin: 10px 0; padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                                <span>${item.productName} (x${item.quantity})</span>
                                <span style="color: #059669;">$${(item.price * item.quantity).toFixed(2)}</span>
                            </div>
                        `).join('')}
                        <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 18px; margin-top: 20px; padding-top: 15px; border-top: 2px solid #10b981; color: #10b981;">
                            <span>Total:</span>
                            <span>$${params.total.toFixed(2)} USD</span>
                        </div>
                    </div>
                    <p>Te mantendremos informado sobre el estado de tu pedido.</p>
                    <p>Gracias por confiar en <strong>ServiPro Garcia LLC</strong>.</p>
                </div>
            </div>
        </body>
        </html>
      `;
    }

    return await emailService.sendEmail({
      to: params.email,
      subject,
      html,
      from: 'ServiPro Garcia LLC <contacto@serviprogarcia.com>'
    });

  } catch (error: any) {
    console.error('❌ Error enviando notificación al cliente:', error.message);
    throw error;
  }
};

// Schemas de validación
const checkoutSessionSchema = z.object({
  items: z.array(z.object({
    productId: z.string(),
    quantity: z.number().min(1),
    variants: z.record(z.string(), z.string()).optional()
  })),
  shippingAddressId: z.string().optional(),
  billingAddressId: z.string().optional(),
  shippingAddress: z.object({
    name: z.string().min(1),
    street: z.string().min(1),
    city: z.string().min(1),
    state: z.string().min(1),
    zipCode: z.string().min(1),
    country: z.string().default('México'),
    phone: z.string().optional()
  }).optional(),
  shippingMethod: z.enum(['standard', 'express', 'overnight']).default('standard'),
  paymentMethod: z.enum(['card', 'paypal', 'bank_transfer', 'cash_on_delivery', 'zelle']),
  orderNumber: z.string().optional(),
  couponCode: z.string().optional(),
  customerNotes: z.string().max(500).optional()
});

const validateCouponSchema = z.object({
  code: z.string().min(1),
  subtotal: z.number().min(0)
});

// Interfaces para tipos internos
interface OrderItemData {
  productId: string;
  productName: string;
  quantity: number;
  price: number;
  totalPrice: number;
  variants?: any;
}

interface OrderTotalsData {
  subtotal: number;
  discount: number;
  shippingCost: number;
  tax: number;
  total: number;
  appliedCoupon: any;
  items: OrderItemData[];
}

// Obtener resumen de checkout
export const getCheckoutSession = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        error: 'Usuario no autenticado'
      });
    }

    // Obtener direcciones del usuario
    const addresses = await prisma.userAddress.findMany({
      where: { userId },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    // Obtener métodos de pago del usuario
    const paymentMethods = await prisma.userPaymentMethod.findMany({
      where: { userId },
      orderBy: [
        { isDefault: 'desc' },
        { createdAt: 'desc' }
      ]
    });

    // Métodos de envío disponibles
    const shippingMethods = [
      { id: 'standard', name: 'Envío Estándar', price: 15, estimatedDays: '5-7', description: 'Entrega en 5-7 días hábiles' },
      { id: 'express', name: 'Envío Rápido', price: 25, estimatedDays: '2-3', description: 'Entrega en 2-3 días hábiles' },
      { id: 'overnight', name: 'Envío Overnight', price: 45, estimatedDays: '1', description: 'Entrega al siguiente día hábil' }
    ];

    res.json({
      addresses,
      paymentMethods,
      shippingMethods,
      config: {
        freeShippingThreshold: 100,
        taxRate: 0.08 // 8% de impuesto
      }
    });

  } catch (error) {
    console.error('Error getting checkout session:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

export const verifyStock = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { items } = req.body;

    if (!items || !Array.isArray(items)) {
      return res.status(400).json({
        error: 'Items requeridos'
      });
    }

    const productIds = items.map((item: any) => item.productId);
    const products = await prisma.product.findMany({
      where: {
        id: { in: productIds },
        isActive: true
      }
    });

    const outOfStockItems = [];
    let allValid = true;

    for (const item of items) {
      const product = products.find(p => p.id === item.productId);
      
      if (!product) {
        outOfStockItems.push({
          productId: item.productId,
          productName: 'Producto no encontrado',
          requested: item.quantity,
          available: 0
        });
        allValid = false;
        continue;
      }

      if (product.trackInventory && product.stockCount < item.quantity) {
        outOfStockItems.push({
          productId: product.id,
          productName: product.name,
          requested: item.quantity,
          available: Math.max(0, product.stockCount)
        });
        allValid = false;
      }
    }

    res.json({
      valid: allValid,
      outOfStockItems
    });

  } catch (error) {
    console.error('Error verificando stock:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};
// Validar cupón de descuento
export const validateCoupon = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validation = validateCouponSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const { code, subtotal } = validation.data;

    const coupon = await prisma.coupon.findFirst({
      where: {
        code: code.toUpperCase(),
        isActive: true,
        AND: [
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gte: new Date() } }
            ]
          },
          {
            OR: [
              { startsAt: null },
              { startsAt: { lte: new Date() } }
            ]
          }
        ]
      }
    });

    if (!coupon) {
      return res.status(404).json({
        error: 'Cupón no válido o expirado'
      });
    }

    // Verificar límite de uso
    if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) {
      return res.status(400).json({
        error: 'Este cupón ha alcanzado su límite de uso'
      });
    }

    // Verificar monto mínimo
    if (coupon.minAmount && subtotal < Number(coupon.minAmount)) {
      return res.status(400).json({
        error: `Este cupón requiere un monto mínimo de $${Number(coupon.minAmount).toFixed(2)}`
      });
    }

    // Calcular descuento
    let discount = 0;
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
        discount = 0; // Se manejará en el cálculo de envío
        break;
    }

    res.json({
      valid: true,
      coupon: {
        id: coupon.id,
        code: coupon.code,
        type: coupon.type,
        value: Number(coupon.value),
        discount,
        freeShipping: coupon.type === 'FREE_SHIPPING'
      }
    });

  } catch (error) {
    console.error('Error validating coupon:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Función auxiliar para calcular totales (no exportada, solo interna)
const calculateOrderTotalsInternal = async (
  items: any[], 
  shippingMethod: string = 'standard', 
  couponCode?: string
): Promise<OrderTotalsData> => {
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error('El carrito está vacío');
  }

  // Obtener productos y calcular subtotal
  const productIds = items.map((item: any) => item.productId);
  const products = await prisma.product.findMany({
    where: {
      id: { in: productIds },
      isActive: true
    }
  });

  let subtotal = 0;
  const orderItems: OrderItemData[] = [];

  for (const item of items) {
    const product = products.find(p => p.id === item.productId);
    if (!product) {
      throw new Error(`Producto ${item.productId} no encontrado`);
    }

    // Verificar stock - NO lanzar error, solo registrar el problema
if (product.trackInventory && product.stockCount < item.quantity) {
  console.warn(`Stock insuficiente para ${product.name}. Solicitado: ${item.quantity}, Disponible: ${product.stockCount}`);
  // Usar stock disponible sin agregar propiedades extra
  const adjustedQuantity = Math.max(0, product.stockCount);
  const itemTotal = Number(product.price) * adjustedQuantity;
  
  orderItems.push({
    productId: product.id,
    productName: product.name,
    quantity: adjustedQuantity, // Cantidad ajustada
    price: Number(product.price),
    totalPrice: itemTotal,
    variants: item.variants || null
  });
  
  subtotal += itemTotal;
  continue;
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
  const shippingRates = {
    standard: 15,
    express: 25,
    overnight: 45
  };
  
  const freeShippingThreshold = 100;
  let shippingCost = shippingRates[shippingMethod as keyof typeof shippingRates] || 15;
  
  // Aplicar envío gratuito si aplica
  if (subtotal >= freeShippingThreshold) {
    shippingCost = 0;
  }

  // Validar y aplicar cupón si existe
  let discount = 0;
  let appliedCoupon = null;

  if (couponCode) {
    const coupon = await prisma.coupon.findFirst({
      where: {
        code: couponCode.toUpperCase(),
        isActive: true,
        AND: [
          {
            OR: [
              { expiresAt: null },
              { expiresAt: { gte: new Date() } }
            ]
          }
        ]
      }
    });

    if (coupon && (!coupon.minAmount || subtotal >= Number(coupon.minAmount))) {
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

      appliedCoupon = {
        id: coupon.id,
        code: coupon.code,
        type: coupon.type,
        discount
      };
    }
  }

  // Calcular impuesto (después del descuento)
  const taxableAmount = Math.max(0, subtotal - discount);
  const tax = taxableAmount * 0.08; // 8% de impuesto

  // Total final
  const total = subtotal - discount + shippingCost + tax;

  return {
    subtotal,
    discount,
    shippingCost,
    tax,
    total,
    appliedCoupon,
    items: orderItems
  };
};

// Calcular totales del pedido (endpoint público)
export const calculateOrderTotals = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { items, shippingMethod = 'standard', couponCode } = req.body;

    const totals = await calculateOrderTotalsInternal(items, shippingMethod, couponCode);
    res.json(totals);

  } catch (error: any) {
    console.error('Error calculating order totals:', error);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
};

// Crear pedido
// Reemplazar la función createOrder en checkoutController.ts (línea ~168)
// Esta versión integra Square en lugar de la simulación

export const createOrder = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        error: 'Usuario no autenticado'
      });
    }    

    const validation = checkoutSessionSchema.safeParse(req.body);
    if (!validation.success) {
      console.log('=== VALIDATION ERRORS ===');
      console.log('Validation errors:', JSON.stringify(validation.error.issues, null, 2));
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues,
        receivedData: req.body
      });
    }

    const {
      items,
      shippingAddressId,
      shippingAddress,
      shippingMethod,
      paymentMethod,
      couponCode,
      customerNotes
    } = validation.data;

    // Verificar que hay items
    if (!items || items.length === 0) {
      return res.status(400).json({
        error: 'El carrito está vacío'
      });
    }

    // ✅ OBTENER INFORMACIÓN DEL USUARIO PARA NOTIFICACIONES
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true
      }
    });

    if (!user) {
      return res.status(400).json({
        error: 'Usuario no encontrado'
      });
    }

    // Obtener o usar dirección de envío
    let finalShippingAddress;
    if (shippingAddressId) {
      const address = await prisma.userAddress.findFirst({
        where: { id: shippingAddressId, userId }
      });
      if (!address) {
        return res.status(400).json({
          error: 'Dirección de envío no encontrada'
        });
      }
      finalShippingAddress = {
        name: address.name,
        street: address.street,
        city: address.city,
        state: address.state,
        zipCode: address.zipCode,
        country: address.country
      };
    } else if (shippingAddress) {
      finalShippingAddress = shippingAddress;
    } else {
      return res.status(400).json({
        error: 'Dirección de envío requerida'
      });
    }

    // 🎯 AQUÍ ES DONDE VA EL CÓDIGO DE ZELLE - ANTES DE RECALCULAR TOTALES
    // ========================================================================
    // AGREGAR: Manejar pago Zelle
    if (paymentMethod === 'zelle') {
      console.log('🔄 Procesando pedido con Zelle...');
      
      // Recalcular totales para Zelle
      const totalsData = await calculateOrderTotalsInternal(items, shippingMethod, couponCode);
      
      // ✅ USAR orderNumber del request PRIMERO
  const orderNumber = req.body.orderNumber || 
    `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
  
  console.log('📋 Usando número de orden:', orderNumber);

      // Crear pedido para Zelle (sin decrementar stock)
      const order = await prisma.$transaction(async (tx) => {
        const newOrder = await tx.order.create({
          data: {
            orderNumber,
            userId,
            subtotal: totalsData.subtotal,
            taxAmount: totalsData.tax,
            shippingAmount: totalsData.shippingCost,
            discountAmount: totalsData.discount,
            totalAmount: totalsData.total,
            status: 'PENDING',
            paymentStatus: 'PENDING', // NUEVO STATUS
            paymentMethod: 'zelle',
            shippingAddress: JSON.stringify(finalShippingAddress),
            notes: `PAGO ZELLE PENDIENTE - ${customerNotes || ''}`.trim()
          }
        });

        // Crear items del pedido
        for (const orderItem of totalsData.items) {
          await tx.orderItem.create({
            data: {
              orderId: newOrder.id,
              productId: orderItem.productId,
              productName: orderItem.productName,
              quantity: orderItem.quantity,
              price: orderItem.price,
              totalPrice: orderItem.totalPrice,
              variants: orderItem.variants ? JSON.stringify(orderItem.variants) : undefined
            }
          });
        }

        // NO decrementar stock aún (esperar confirmación de pago Zelle)
        console.log('⏸️ Stock NO decrementado - esperando confirmación de pago Zelle');

        // Si hay cupón aplicado, incrementar uso
        if (totalsData.appliedCoupon) {
          await tx.coupon.update({
            where: { id: totalsData.appliedCoupon.id },
            data: {
              usageCount: {
                increment: 1
              }
            }
          });
        }

        return newOrder;
      });

      console.log(`✅ Pedido Zelle creado: ${orderNumber}`);

      // ✅ ENVIAR NOTIFICACIONES PARA ZELLE (SIN FALLAR SI HAY ERROR)
      try {
        const customerName = `${user.firstName} ${user.lastName}`;
        
        // Notificación al cliente
        await sendCustomerOrderNotification({
          email: user.email,
          customerName,
          orderNumber: order.orderNumber,
          total: Number(order.totalAmount),
          items: totalsData.items.map(item => ({
            productName: item.productName,
            quantity: item.quantity,
            price: item.price
          })),
          paymentMethod: 'zelle',
          isZelle: true
        });

        // Notificación al admin
        await sendAdminOrderNotification({
          orderNumber: order.orderNumber,
          customerName,
          customerEmail: user.email,
          total: Number(order.totalAmount),
          paymentMethod: 'zelle',
          status: 'PENDING',
          itemsCount: totalsData.items.length,
          shippingAddress: finalShippingAddress
        });

        console.log('✅ Notificaciones enviadas para pedido Zelle:', order.orderNumber);
      } catch (emailError) {
        console.error('❌ Error enviando notificaciones Zelle (no crítico):', emailError);
        // No fallar la creación del pedido por error en email
      }

      return res.status(201).json({
        message: 'Pedido creado - Pendiente de confirmación de pago Zelle',
        order: {
          id: order.id,
          orderNumber: order.orderNumber,
          status: 'pending_payment',
          paymentStatus: 'pending',
          total: Number(order.totalAmount),
          items: totalsData.items.length,
          paymentMethod: 'Zelle - Pendiente de confirmación'
        },
        redirectUrl: `/account/orders/${order.id}`,
        requiresPayment: false, // No requiere procesamiento adicional
        paymentInstructions: {
          method: 'zelle',
          message: 'Tu pedido ha sido creado. Te contactaremos cuando confirmemos tu pago por Zelle.'
        }
      });
    }

    // Recalcular totales para seguridad
    const totalsData = await calculateOrderTotalsInternal(items, shippingMethod, couponCode);

    // Generar número de pedido único
    const orderNumber = `ORD-${Date.now()}-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;

    // Iniciar transacción
    const order = await prisma.$transaction(async (tx) => {
      // Crear el pedido
      const newOrder = await tx.order.create({
        data: {
          orderNumber,
          userId,
          subtotal: totalsData.subtotal,
          taxAmount: totalsData.tax,
          shippingAmount: totalsData.shippingCost,
          discountAmount: totalsData.discount,
          totalAmount: totalsData.total,
          status: 'PENDING',
          paymentStatus: 'PENDING',
          paymentMethod,
          shippingAddress: JSON.stringify(finalShippingAddress),
          notes: customerNotes || null
        }
      });

      // Crear los items del pedido
      for (const orderItem of totalsData.items) {
        await tx.orderItem.create({
          data: {
            orderId: newOrder.id,
            productId: orderItem.productId,
            productName: orderItem.productName,
            quantity: orderItem.quantity,
            price: orderItem.price,
            totalPrice: orderItem.totalPrice,
            variants: orderItem.variants ? JSON.stringify(orderItem.variants) : undefined
          }
        });
      }

      // Actualizar stock de productos
      for (const item of items) {
        await tx.product.update({
          where: { id: item.productId },
          data: {
            stockCount: {
              decrement: item.quantity
            },
            salesCount: {
              increment: item.quantity
            }
          }
        });
      }

      // Incrementar uso del cupón si aplica
      if (totalsData.appliedCoupon) {
        await tx.coupon.update({
          where: { id: totalsData.appliedCoupon.id },
          data: {
            usageCount: {
              increment: 1
            }
          }
        });
      }

      return newOrder;
    });

    console.log(`Pedido creado: ${orderNumber} por usuario ${userId}`);

    // ✅ ENVIAR NOTIFICACIONES PARA MÉTODOS NORMALES (SIN FALLAR SI HAY ERROR)
    try {
      const customerName = `${user.firstName} ${user.lastName}`;
      
      // Notificación al cliente
      await sendCustomerOrderNotification({
        email: user.email,
        customerName,
        orderNumber: order.orderNumber,
        total: Number(order.totalAmount),
        items: totalsData.items.map(item => ({
          productName: item.productName,
          quantity: item.quantity,
          price: item.price
        })),
        paymentMethod,
        isZelle: false
      });

      // Notificación al admin
      await sendAdminOrderNotification({
        orderNumber: order.orderNumber,
        customerName,
        customerEmail: user.email,
        total: Number(order.totalAmount),
        paymentMethod,
        status: 'PENDING',
        itemsCount: totalsData.items.length,
        shippingAddress: finalShippingAddress
      });

      console.log('✅ Notificaciones enviadas para pedido:', order.orderNumber);
    } catch (emailError) {
      console.error('❌ Error enviando notificaciones (no crítico):', emailError);
      // No fallar la creación del pedido por error en email
    }

    // **NUEVA INTEGRACIÓN CON SQUARE**
    // En lugar de simular el pago, devolvemos la información necesaria
    // para que el frontend procese el pago con Square
    
    // El pago real se procesará cuando el frontend llame a /api/square/process-payment
    // con el token generado por Square Web Payments SDK

    res.status(201).json({
      message: 'Pedido creado exitosamente',
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: 'pending_payment', // Estado específico para pagos pendientes
        paymentStatus: 'pending',
        total: Number(order.totalAmount),
        items: totalsData.items.length,
        currency: 'USD', // o tu moneda preferida
        // Información adicional para Square
        paymentData: {
          orderId: order.id,
          amount: Number(order.totalAmount),
          currency: 'USD',
          buyerEmail: req.user?.email,
          shippingAddress: {
            addressLine1: finalShippingAddress.street,
            locality: finalShippingAddress.city,
            administrativeDistrictLevel1: finalShippingAddress.state,
            postalCode: finalShippingAddress.zipCode,
            country: finalShippingAddress.country
          }
        }
      },
      // El frontend usará esta URL después del pago exitoso
      redirectUrl: `/account/orders/${order.id}`,
      // Indicar que el pago debe procesarse
      requiresPayment: true
    });

  } catch (error: any) {
    console.error('Error creating order:', error);
    res.status(500).json({ 
      error: error.message || 'Error interno del servidor' 
    });
  }
  
};

// Simular procesamiento de pago
async function simulatePayment(paymentMethod: string, amount: number): Promise<boolean> {
  // Simular delay de procesamiento
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Simular tasa de éxito del 95%
  return Math.random() > 0.05;
}

// Obtener métodos de envío
export const getShippingMethods = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { subtotal = 0 } = req.query;
    const freeShippingThreshold = 100;

    const shippingMethods = [
      {
        id: 'standard',
        name: 'Envío Estándar',
        description: 'Entrega en 5-7 días hábiles',
        price: Number(subtotal) >= freeShippingThreshold ? 0 : 15,
        estimatedDays: '5-7',
        isFree: Number(subtotal) >= freeShippingThreshold
      },
      {
        id: 'express',
        name: 'Envío Rápido',
        description: 'Entrega en 2-3 días hábiles',
        price: 25,
        estimatedDays: '2-3',
        isFree: false
      },
      {
        id: 'overnight',
        name: 'Envío Overnight',
        description: 'Entrega al siguiente día hábil',
        price: 45,
        estimatedDays: '1',
        isFree: false
      }
    ];

    res.json({ shippingMethods });

  } catch (error) {
    console.error('Error getting shipping methods:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};