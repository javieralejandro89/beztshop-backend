// src/services/stripeService.ts
import Stripe from 'stripe';

console.log('🔵 Cargando stripeService...');
console.log('🔑 STRIPE_SECRET_KEY existe:', !!process.env.STRIPE_SECRET_KEY);

if (!process.env.STRIPE_SECRET_KEY) {
  const error = new Error('❌ STRIPE_SECRET_KEY no está configurada en .env');
  console.error(error);
  throw error;
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
console.log('✅ Stripe inicializado correctamente');

export const stripeService = {
  // Crear Payment Intent
  createPaymentIntent: async (params: {
    amount: number;
    currency: string;
    orderId: string;
    customerEmail?: string;
    metadata?: Record<string, string>;
  }) => {
    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(params.amount * 100), // Stripe usa centavos
        currency: params.currency.toLowerCase(),
        metadata: {
          orderId: params.orderId,
          ...params.metadata
        },
        receipt_email: params.customerEmail,
        payment_method_types: ['card']        
      });

      return {
        success: true,
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      };
    } catch (error: any) {
      console.error('Error creando Payment Intent:', error);
      throw new Error(`Error en Stripe: ${error.message}`);
    }
  },

  // Confirmar pago
  confirmPayment: async (paymentIntentId: string) => {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      
      return {
        success: paymentIntent.status === 'succeeded',
        status: paymentIntent.status,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency
      };
    } catch (error: any) {
      console.error('Error confirmando pago:', error);
      throw new Error(`Error confirmando pago: ${error.message}`);
    }
  },

  // Obtener detalles del pago
  getPaymentDetails: async (paymentIntentId: string) => {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
      return paymentIntent;
    } catch (error: any) {
      console.error('Error obteniendo detalles:', error);
      throw new Error(`Error obteniendo detalles: ${error.message}`);
    }
  },

  // Obtener detalles del Payment Method
getPaymentMethod: async (paymentIntentId: string) => {
  try {
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
    
    if (!paymentIntent.payment_method) {
      return null;
    }

    const paymentMethodId = typeof paymentIntent.payment_method === 'string' 
      ? paymentIntent.payment_method 
      : paymentIntent.payment_method.id;

    const paymentMethod = await stripe.paymentMethods.retrieve(paymentMethodId);
    
    return {
      type: paymentMethod.type,
      card: paymentMethod.card ? {
        brand: paymentMethod.card.brand,
        last4: paymentMethod.card.last4,
        exp_month: paymentMethod.card.exp_month,
        exp_year: paymentMethod.card.exp_year
      } : null
    };
  } catch (error: any) {
    console.error('Error obteniendo Payment Method:', error);
    return null;
  }
}
};

export default stripeService;