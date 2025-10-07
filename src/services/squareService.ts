// src/services/squareService.ts - Servicio Square corregido para SDK v43
import { SquareClient } from 'square';
import { v4 as uuidv4 } from 'uuid';

// Configuración del cliente Square
const client = new SquareClient({
  token: process.env.SQUARE_ACCESS_TOKEN,
  environment: process.env.NODE_ENV === 'production' ? 'https://connect.squareup.com' : 'https://connect.squareupsandbox.com',
});

export interface CreatePaymentRequest {
  sourceId: string; // Token del frontend
  amountCents: number; // Monto en centavos
  currency: string;
  orderId: string;
  buyerEmailAddress?: string;
  billingAddress?: {
    addressLine1?: string;
    addressLine2?: string;
    locality?: string;
    administrativeDistrictLevel1?: string;
    postalCode?: string;
    country?: string;
  };
  shippingAddress?: {
    addressLine1?: string;
    addressLine2?: string;
    locality?: string;
    administrativeDistrictLevel1?: string;
    postalCode?: string;
    country?: string;
  };
  note?: string;
  verificationToken?: string; // Para 3D Secure
}

export interface SquarePaymentResult {
  success: boolean;
  payment?: any;
  error?: string;
  transactionId?: string;
  receiptUrl?: string;
  details?: {
  originalError?: string;
  shouldRetry?: boolean;
  timestamp?: string;
  environment?: string;
  errorCode?: string;
  errorCategory?: string;
};
}

export class SquareService {
  private readonly paymentsApi;
  private readonly locationsApi;
  private readonly customersApi;
  private readonly refundsApi;

  constructor() {
    this.paymentsApi = client.payments; // ✅ Correcto para v43+
    this.locationsApi = client.locations;
    this.customersApi = client.customers;
    this.refundsApi = client.refunds;
  }

  /**
   * Obtener ubicaciones del comerciante
   */
  async getLocations() {
    try {
      console.log('🏪 Obteniendo ubicaciones Square...');
      const response = await this.locationsApi.list(); // ✅ Método correcto
      const locations = response.locations || [];
      console.log(`✅ Encontradas ${locations.length} ubicaciones`);
      return locations;
    } catch (error: any) {
      console.error('❌ Error obteniendo ubicaciones:', error);
      throw new Error(`Error obteniendo ubicaciones: ${error.message}`);
    }
  }

  /**
   * Crear un pago con Square
   */
  async createPayment(paymentData: CreatePaymentRequest): Promise<SquarePaymentResult> {
    try {
      console.log('💳 Procesando pago con Square...');
      console.log('Datos del pago:', {
        sourceId: paymentData.sourceId.substring(0, 10) + '...', // Solo mostrar parte por seguridad
        amountCents: paymentData.amountCents,
        currency: paymentData.currency,
        orderId: paymentData.orderId,
        environment: process.env.NODE_ENV
      });

      // Obtener la primera ubicación disponible
      const locations = await this.getLocations();
      if (!locations || locations.length === 0) {
        throw new Error('No se encontraron ubicaciones válidas en Square');
      }

      const locationId = locations[0].id!;
      console.log(`📍 Usando ubicación: ${locationId}`);

      // Preparar datos del pago
      const idempotencyKey = uuidv4();
      
      const paymentRequest: any = {
        sourceId: paymentData.sourceId,
        idempotencyKey,
        amountMoney: {
          amount: BigInt(paymentData.amountCents),
          currency: paymentData.currency.toUpperCase() as any
        },
        locationId,
        referenceId: paymentData.orderId,
        note: paymentData.note || `Pedido ${paymentData.orderId}`,
        acceptPartialAuthorization: false,
        autocomplete: true, // Capturar inmediatamente
      };

      // Agregar email del comprador si está disponible
      if (paymentData.buyerEmailAddress) {
        paymentRequest.buyerEmailAddress = paymentData.buyerEmailAddress;
      }

      // Agregar dirección de facturación si está disponible
      if (paymentData.billingAddress) {
        paymentRequest.billingAddress = {
          addressLine1: paymentData.billingAddress.addressLine1,
          addressLine2: paymentData.billingAddress.addressLine2,
          locality: paymentData.billingAddress.locality,
          administrativeDistrictLevel1: paymentData.billingAddress.administrativeDistrictLevel1,
          postalCode: paymentData.billingAddress.postalCode,
          country: paymentData.billingAddress.country
        };
      }

      // Agregar dirección de envío si está disponible
      if (paymentData.shippingAddress) {
        paymentRequest.shippingAddress = {
          addressLine1: paymentData.shippingAddress.addressLine1,
          addressLine2: paymentData.shippingAddress.addressLine2,
          locality: paymentData.shippingAddress.locality,
          administrativeDistrictLevel1: paymentData.shippingAddress.administrativeDistrictLevel1,
          postalCode: paymentData.shippingAddress.postalCode,
          country: paymentData.shippingAddress.country
        };
      }

      // Agregar token de verificación para 3D Secure si está disponible
      if (paymentData.verificationToken) {
        paymentRequest.verificationToken = paymentData.verificationToken;
      }

      if (process.env.NODE_ENV === 'production' && paymentData.amountCents < 100) {
        throw new Error('El monto mínimo para pagos en producción es $1.00 USD');
    }

      console.log('📤 Enviando solicitud de pago a Square...');

      // Crear el pago
      const response = await this.paymentsApi.create(paymentRequest);
      const payment = response.payment;

      if (payment) {
        console.log('✅ Pago procesado exitosamente');
        console.log('Payment ID:', payment.id);
        console.log('Status:', payment.status);
        console.log('Amount:', payment.amountMoney);

        return {
          success: true,
          payment: payment,
          transactionId: payment.id,
          receiptUrl: payment.receiptUrl
        };
      } else {
        console.error('❌ No se recibió información del pago');
        return {
          success: false,
          error: 'No se pudo procesar el pago - respuesta vacía'
        };
      }

    } catch (error: any) {
      console.error('❌ Error procesando pago:', error);

       // ✅ MANEJO MEJORADO DE ERRORES ESPECÍFICOS DE SQUARE
      return this.handleSquarePaymentError(error);
    }
  }

  /**
   * ✅ NUEVO MÉTODO PARA MANEJAR ERRORES ESPECÍFICOS DE SQUARE
   */
  private handleSquarePaymentError(error: any): SquarePaymentResult {
    let errorMessage = 'Error procesando el pago';
    let userFriendlyMessage = 'No se pudo procesar tu pago. Por favor intenta nuevamente.';
    let shouldRetry = true;

    console.log('🔍 Analizando error de Square:', error);

    // Verificar si es un error de Square con estructura específica
    if (error.result?.errors && Array.isArray(error.result.errors)) {
      const squareError = error.result.errors[0];
      const errorCode = squareError.code;
      const errorDetail = squareError.detail;
      const errorCategory = squareError.category;

      console.log('📋 Detalles del error Square:', {
        code: errorCode,
        detail: errorDetail,
        category: errorCategory
      });

      // ✅ MAPEO COMPLETO DE ERRORES ESPECÍFICOS DE SQUARE
      switch (errorCode) {
        // Errores de tarjeta declinada
        case 'CARD_DECLINED':
          userFriendlyMessage = 'Tu tarjeta fue declinada por el banco. Por favor verifica los datos o usa otra tarjeta.';
          shouldRetry = true;
          break;

        case 'GENERIC_DECLINE':
          userFriendlyMessage = 'Tu banco declinó la transacción. Contacta a tu banco o intenta con otra tarjeta.';
          shouldRetry = true;
          break;

        // Errores de fondos
        case 'INSUFFICIENT_FUNDS':
          userFriendlyMessage = 'Tu tarjeta no tiene fondos suficientes. Verifica tu saldo o usa otro método de pago.';
          shouldRetry = true;
          break;

        // Errores de validación de tarjeta
        case 'CVV_FAILURE':
          userFriendlyMessage = 'El código de seguridad (CVV) es incorrecto. Verifica los 3 dígitos en el reverso de tu tarjeta.';
          shouldRetry = true;
          break;

        case 'INVALID_CARD':
        case 'INVALID_CARD_DATA':
          userFriendlyMessage = 'Los datos de la tarjeta no son válidos. Verifica el número, fecha de vencimiento y CVV.';
          shouldRetry = true;
          break;

        case 'CARD_EXPIRED':
          userFriendlyMessage = 'Tu tarjeta ha expirado. Por favor usa una tarjeta vigente.';
          shouldRetry = false;
          break;

        // Errores de verificación
        case 'ADDRESS_VERIFICATION_FAILURE':
          userFriendlyMessage = 'Error en la verificación de dirección. Verifica que coincida con tu dirección de facturación.';
          shouldRetry = true;
          break;

        case 'POSTAL_CODE_INVALID':
          userFriendlyMessage = 'El código postal no es válido. Verifica que coincida con tu dirección de facturación.';
          shouldRetry = true;
          break;

        case 'CARD_DECLINED_VERIFICATION_REQUIRED':
          userFriendlyMessage = 'Tu banco requiere verificación adicional. Contacta a tu banco para autorizar este pago.';
          shouldRetry = false;
          break;

        // Errores de límites
        case 'PAYMENT_AMOUNT_TOO_HIGH':
          userFriendlyMessage = 'El monto es muy alto para tu tarjeta. Contacta a tu banco o divide el pago.';
          shouldRetry = false;
          break;

        case 'PAYMENT_AMOUNT_TOO_LOW':
          userFriendlyMessage = 'El monto es muy bajo para procesar. El mínimo es $1.00 USD.';
          shouldRetry = false;
          break;

        // Errores del comerciante
        case 'CARD_NOT_SUPPORTED':
          userFriendlyMessage = 'Tu tipo de tarjeta no es compatible. Por favor usa una tarjeta Visa, Mastercard o American Express.';
          shouldRetry = false;
          break;

        case 'CARD_DECLINED_CALL_ISSUER':
          userFriendlyMessage = 'Tu banco requiere que los contactes directamente para autorizar este pago.';
          shouldRetry = false;
          break;

        case 'CARD_DECLINED_FRAUD_SUSPECTED':
          userFriendlyMessage = 'El pago fue marcado como posible fraude. Contacta a tu banco para resolver este bloqueo.';
          shouldRetry = false;
          break;

        // Errores de configuración
        case 'LOCATION_NOT_AUTHORIZED':
          userFriendlyMessage = 'Error en la configuración del comerciante. Contacta al soporte técnico.';
          shouldRetry = false;
          break;

        case 'BAD_REQUEST':
          if (errorDetail?.includes('not been enabled to take payments')) {
            userFriendlyMessage = 'El sistema de pagos no está habilitado. Contacta al soporte técnico.';
          } else {
            userFriendlyMessage = 'Error en los datos del pago. Verifica la información e intenta nuevamente.';
          }
          shouldRetry = false;
          break;

        // Errores de límites del comerciante
        case 'MERCHANT_SUBSCRIPTION_NOT_FOUND':
        case 'PROCESSING_LIMIT_EXCEEDED':
          userFriendlyMessage = 'Se ha excedido el límite de procesamiento. Contacta al soporte para resolver este problema.';
          shouldRetry = false;
          break;

        // Error por defecto
        default:
          console.log('⚠️ Código de error no manejado:', errorCode);
          if (errorDetail) {
            // Usar el detalle si está disponible pero hacer más amigable
            if (errorDetail.toLowerCase().includes('insufficient')) {
              userFriendlyMessage = 'Fondos insuficientes en tu tarjeta. Verifica tu saldo o usa otro método de pago.';
            } else if (errorDetail.toLowerCase().includes('declined')) {
              userFriendlyMessage = 'Tu tarjeta fue declinada. Verifica los datos o contacta a tu banco.';
            } else if (errorDetail.toLowerCase().includes('invalid')) {
              userFriendlyMessage = 'Datos de tarjeta inválidos. Verifica la información ingresada.';
            } else {
              userFriendlyMessage = `Error: ${errorDetail}. Si el problema persiste, contacta al soporte.`;
            }
          }
          break;
      }

      errorMessage = `${errorCode}: ${errorDetail}`;
    } 
    // Manejar errores de red o configuración
    else if (error.message) {
      console.log('🌐 Error de red o configuración:', error.message);
      
      if (error.message.includes('network') || error.message.includes('timeout')) {
        userFriendlyMessage = 'Error de conexión. Verifica tu internet e intenta nuevamente.';
      } else if (error.message.includes('unauthorized') || error.message.includes('forbidden')) {
        userFriendlyMessage = 'Error de autorización. Contacta al soporte técnico.';
      } else {
        userFriendlyMessage = 'Error técnico temporal. Por favor intenta nuevamente en unos minutos.';
      }
      
      errorMessage = error.message;
    }

    // ✅ RESPUESTA ESTRUCTURADA CON INFORMACIÓN PARA EL FRONTEND
    return {
      success: false,
      error: userFriendlyMessage, // Mensaje amigable para mostrar al usuario
      details: { // Información adicional para el frontend
        originalError: errorMessage,
        shouldRetry,
        timestamp: new Date().toISOString(),
        environment: process.env.NODE_ENV,
        // Incluir códigos específicos si están disponibles
        ...(error.result?.errors?.[0] && {
          errorCode: error.result.errors[0].code,
          errorCategory: error.result.errors[0].category
        })
      }
    };
  }

  /**
   * Obtener información de un pago
   */
  async getPayment(paymentId: string) {
    try {
      console.log(`🔍 Obteniendo información del pago: ${paymentId}`);
      const response = await this.paymentsApi.get({ paymentId });
      return response.payment;
    } catch (error: any) {
      console.error('❌ Error obteniendo información del pago:', error);
      throw new Error(`Error obteniendo pago: ${error.message}`);
    }
  }

  /**
   * Reembolsar un pago
   */
  async refundPayment(paymentId: string, amountCents: number, reason?: string) {
    try {
      console.log(`💸 Procesando reembolso para pago: ${paymentId}`);
      
      const idempotencyKey = uuidv4();
      
      const refundRequest = {
        idempotencyKey,
        amountMoney: {
          amount: BigInt(amountCents),
          currency: 'USD' as any // Ajustar según tu moneda
        },
        paymentId,
        reason: reason || 'Reembolso solicitado por el cliente'
      };

      const response = await this.refundsApi.refundPayment(refundRequest);
      
      console.log('✅ Reembolso procesado exitosamente');
      return response.refund;
    } catch (error: any) {      
      throw new Error(`Error procesando reembolso: ${error.message}`);
    }
  }

  /**
   * Crear un cliente en Square (opcional)
   */
  async createCustomer(customerData: {
    givenName?: string;
    familyName?: string;
    emailAddress?: string;
    phoneNumber?: string;
  }) {
    try {
      console.log('👤 Creando cliente en Square...');
      
      const createCustomerRequest = {
        ...customerData,
        idempotencyKey: uuidv4()
      };

      const response = await this.customersApi.create(createCustomerRequest);
      
      console.log('✅ Cliente creado exitosamente');
      return response.customer;
    } catch (error: any) {
      console.error('❌ Error creando cliente:', error);
      // No es crítico si falla la creación del cliente
      return null;
    }
  }

  /**
   * Validar configuración de Square
   */
  async validateConfiguration() {
    try {
      console.log('🔧 Validando configuración Square...');
      
      // Verificar que tenemos access token
      if (!process.env.SQUARE_ACCESS_TOKEN) {
        throw new Error('SQUARE_ACCESS_TOKEN no configurado');
      }

      // Verificar que podemos obtener ubicaciones
      const locations = await this.getLocations();
      if (!locations || locations.length === 0) {
        throw new Error('No se encontraron ubicaciones válidas');
      }

      const isProduction = process.env.NODE_ENV === 'production';
      console.log(`✅ Configuración Square válida - Entorno: ${isProduction ? 'PRODUCCIÓN' : 'SANDBOX'}`);

      
      return {
        valid: true,
        environment: isProduction ? 'production' : 'sandbox',
        locationsCount: locations.length
      };
    } catch (error: any) {
      console.error('❌ Error validando configuración:', error);
      return {
        valid: false,
        error: error.message,
        environment: process.env.NODE_ENV === 'production' ? 'production' : 'sandbox'
      };
    }
  }
}

export default new SquareService();