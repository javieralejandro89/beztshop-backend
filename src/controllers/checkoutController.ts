// src/controllers/checkoutController.ts - Controlador de checkout corregido
import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import { emailService } from '../services/emailService';

const prisma = new PrismaClient();

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

    res.json({
  addresses,
  paymentMethods,
  config: {
    freeShippingThreshold: 299,
    taxRate: 0
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
    const userId = req.user?.id;

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

    // ✅ NUEVO: Verificar si el usuario ya usó este cupón
    if (req.user?.id) {
      const userUsage = await prisma.couponUsage.findFirst({
        where: {
          couponId: coupon.id,
          userId: req.user.id
        }
      });

      if (userUsage) {
        return res.status(400).json({
          error: 'Ya has usado este cupón anteriormente'
        });
      }
    }


    // Verificar límite de uso global
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
  couponCode?: string,
  userId?: string // 🆕 AGREGAR userId
): Promise<OrderTotalsData> => {
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new Error('El carrito está vacío');
  }

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

    if (product.trackInventory && product.stockCount < item.quantity) {
      console.warn(`Stock insuficiente para ${product.name}. Solicitado: ${item.quantity}, Disponible: ${product.stockCount}`);
      const adjustedQuantity = Math.max(0, product.stockCount);
      const itemTotal = Number(product.price) * adjustedQuantity;
      
      orderItems.push({
        productId: product.id,
        productName: product.name,
        quantity: adjustedQuantity,
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

  const freeShippingThreshold = 299;
  let totalWeight = 0;
  for (const item of items) {
    const product = products.find(p => p.id === item.productId);
    if (product && product.weight) {
      totalWeight += Number(product.weight) * item.quantity;
    }
  }

  if (totalWeight === 0) {
    totalWeight = items.reduce((sum, item) => sum + item.quantity, 0) * 0.5;
  }

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

  // 🆕 VALIDAR Y APLICAR CUPÓN CON LÓGICA AVANZADA
  let discount = 0;
  let appliedCoupon = null;
  let couponApplicableProducts: string[] = [];

  if (couponCode && userId) {
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
          },
          {
            OR: [
              { startsAt: null },
              { startsAt: { lte: new Date() } }
            ]
          }
        ]
      },
      include: {
        usages: {
          where: { userId },
          select: { id: true }
        }
      }
    });

    if (coupon) {
      // ✅ Verificar límite de uso por usuario
      if (coupon.usageLimitPerUser) {
        if (coupon.usages.length >= coupon.usageLimitPerUser) {
          console.warn(`Usuario ${userId} ya alcanzó límite de uso del cupón ${coupon.code}`);
        } else {
          if (!coupon.minAmount || subtotal >= Number(coupon.minAmount)) {
            
            // 🆕 DETERMINAR PRODUCTOS APLICABLES
            if (coupon.applicationType === 'ALL_PRODUCTS') {
              couponApplicableProducts = productIds;
            } else if (coupon.applicationType === 'SPECIFIC_PRODUCTS') {
              const applicableIds = coupon.applicableProductIds?.split(',').filter(Boolean) || [];
              couponApplicableProducts = productIds.filter(id => applicableIds.includes(id));
            } else if (coupon.applicationType === 'SPECIFIC_CATEGORIES') {
              const categoryIds = coupon.applicableCategoryIds?.split(',').filter(Boolean) || [];
              const applicableProds = await prisma.product.findMany({
                where: {
                  id: { in: productIds },
                  categoryId: { in: categoryIds }
                },
                select: { id: true }
              });
              couponApplicableProducts = applicableProds.map(p => p.id);
            } else if (coupon.applicationType === 'EXCLUDE_PRODUCTS') {
              const excludedIds = coupon.excludedProductIds?.split(',').filter(Boolean) || [];
              couponApplicableProducts = productIds.filter(id => !excludedIds.includes(id));
            }

            if (couponApplicableProducts.length > 0) {
              // 🆕 CALCULAR DESCUENTO SOLO EN PRODUCTOS APLICABLES
              let applicableSubtotal = 0;
              
              for (const item of orderItems) {
                if (couponApplicableProducts.includes(item.productId)) {
                  applicableSubtotal += item.totalPrice;
                }
              }

              switch (coupon.type) {
                case 'PERCENTAGE':
                  discount = (applicableSubtotal * Number(coupon.value)) / 100;
                  if (coupon.maxDiscount) {
                    discount = Math.min(discount, Number(coupon.maxDiscount));
                  }
                  break;
                  
                case 'FIXED_AMOUNT':
                  discount = Math.min(Number(coupon.value), applicableSubtotal);
                  break;
                  
                case 'FREE_SHIPPING':
                  shippingCost = 0;
                  break;
              }

              appliedCoupon = {
                id: coupon.id,
                code: coupon.code,
                type: coupon.type,
                discount,
                description: coupon.description,
                applicableProducts: couponApplicableProducts
              };
            }
          }
        }
      }
    }
  }

  const taxableAmount = Math.max(0, subtotal - discount);
  const tax = 0;
  const total = subtotal - discount + shippingCost;

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
    const { items, couponCode } = req.body;
    const userId = req.user?.id; // 🆕 Obtener userId
    const totals = await calculateOrderTotalsInternal(items, couponCode, userId); // 🆕 Pasar userId
    res.json(totals);
  } catch (error: any) {
    console.error('Error calculating order totals:', error);
    res.status(500).json({ error: error.message || 'Error interno del servidor' });
  }
};

// Crear pedido
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

    // 🆕 VALIDAR CUPÓN NUEVAMENTE AL CREAR ORDEN (evitar race conditions)
if (couponCode && userId) {
  const couponValidation = await prisma.coupon.findFirst({
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
    },
    include: {
      usages: {
        where: { userId },
        select: { id: true }
      }
    }
  });

  if (!couponValidation) {
    return res.status(400).json({
      error: 'El cupón ya no es válido'
    });
  }

  // ✅ VALIDAR LÍMITE DE USOS POR USUARIO
  if (couponValidation.usageLimitPerUser) {
    if (couponValidation.usages.length >= couponValidation.usageLimitPerUser) {
      return res.status(400).json({
        error: `Ya has usado este cupón el máximo de veces permitido (${couponValidation.usageLimitPerUser})`,
        code: 'USER_USAGE_LIMIT_REACHED'
      });
    }
  }
}

    // Recalcular totales para seguridad
    const totalsData = await calculateOrderTotalsInternal(items, couponCode, userId);

    // 🔍 DEBUG: Verificar datos del cupón
console.log('=== TOTALES CALCULADOS ===');
console.log('Subtotal:', totalsData.subtotal);
console.log('Descuento:', totalsData.discount);
console.log('Total:', totalsData.total);
console.log('Cupón aplicado:', totalsData.appliedCoupon);
console.log('Código de cupón recibido:', couponCode);

if (totalsData.appliedCoupon) {
  console.log('✅ HAY CUPÓN APLICADO:');
  console.log('  - ID:', totalsData.appliedCoupon.id);
  console.log('  - Código:', totalsData.appliedCoupon.code);
  console.log('  - Descuento:', totalsData.discount);
} else {
  console.log('❌ NO HAY CUPÓN APLICADO');
}

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

      // 🆕 REGISTRAR USO DEL CUPÓN - MEJORADO
      console.log('🔍 Verificando si hay cupón para registrar...');
      console.log('appliedCoupon:', totalsData.appliedCoupon);
      console.log('discount:', totalsData.discount);

      if (totalsData.appliedCoupon) {
        console.log(`💾 REGISTRANDO uso del cupón ${totalsData.appliedCoupon.code}`);
        console.log(`   - Cupón ID: ${totalsData.appliedCoupon.id}`);
        console.log(`   - Usuario ID: ${userId}`);
        console.log(`   - Orden ID: ${newOrder.id}`);
        console.log(`   - Descuento: ${totalsData.discount}`);

        try {
          // Crear registro de uso
          const couponUsage = await tx.couponUsage.create({
            data: {
              couponId: totalsData.appliedCoupon.id,
              userId: userId,
              orderId: newOrder.id,
              discountAmount: totalsData.discount,
              orderTotal: totalsData.total,
              productsApplied: JSON.stringify(totalsData.appliedCoupon.applicableProducts || [])
            }
          });

          console.log(`✅ Uso de cupón registrado exitosamente:`, couponUsage.id);

          // Incrementar contador
          const updatedCoupon = await tx.coupon.update({
            where: { id: totalsData.appliedCoupon.id },
            data: {
              usageCount: { increment: 1 }
            }
          });

          console.log(`✅ Contador de cupón actualizado:`, updatedCoupon.usageCount);

        } catch (couponError) {
          console.error(`❌ ERROR al registrar uso de cupón:`, couponError);
          // Re-lanzar error para hacer rollback de toda la transacción
          throw couponError;
        }
      } else {
        console.log('ℹ️ No hay cupón aplicado, saltando registro');
      }

      return newOrder;
    });

    console.log(`Pedido creado: ${orderNumber} por usuario ${userId}`);
    

    res.status(201).json({
      message: 'Pedido creado exitosamente',
      order: {
        id: order.id,
        orderNumber: order.orderNumber,
        status: 'pending_payment', // Estado específico para pagos pendientes
        paymentStatus: 'pending',
        total: Number(order.totalAmount),
        items: totalsData.items.length,
        currency: 'MXN'
     },
     redirectUrl: `/account/orders/${order.id}`,
     requiresPayment: true
   });

  } catch (error: any) {
    console.error('Error creating order:', error);
    res.status(500).json({ 
      error: error.message || 'Error interno del servidor' 
    });
  }
  
};


