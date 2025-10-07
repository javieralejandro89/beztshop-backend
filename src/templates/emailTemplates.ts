export const orderStatusTemplate = (data: {
  customerName: string;
  orderNumber: string;
  status: string;
  trackingNumber?: string;
  notes?: string;
}) => {
  const statusMessages = {
    CONFIRMED: 'Tu pedido ha sido confirmado y está siendo preparado.',
    PROCESSING: 'Tu pedido está siendo procesado.',
    SHIPPED: 'Tu pedido ha sido enviado.',
    DELIVERED: 'Tu pedido ha sido entregado.',
    CANCELLED: 'Tu pedido ha sido cancelado.'
  };

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Actualización de Pedido</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #2563eb;">Actualización de tu Pedido</h2>
            
            <p>Hola ${data.customerName},</p>
            
            <p>Te informamos sobre una actualización en tu pedido <strong>#${data.orderNumber}</strong>.</p>
            
            <div style="background: #f3f4f6; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0;">Estado: ${data.status}</h3>
                <p>${statusMessages[data.status as keyof typeof statusMessages] || 'Tu pedido ha sido actualizado.'}</p>
                
                ${data.trackingNumber ? `
                    <p><strong>Número de seguimiento:</strong> ${data.trackingNumber}</p>
                ` : ''}
                
                ${data.notes ? `
                    <p><strong>Notas adicionales:</strong> ${data.notes}</p>
                ` : ''}
            </div>
            
            <p>Puedes revisar el estado completo de tu pedido en tu cuenta.</p>
            
            <p>Gracias por comprar con ServiPro Garcia LLC.</p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                <p style="font-size: 12px; color: #6b7280;">
                    Este es un email automático, por favor no respondas.
                </p>
            </div>
        </div>
    </body>
    </html>
  `;
};

export const orderCreatedTemplate = (data: {
  customerName: string;
  orderNumber: string;
  total: number;
  items: Array<{name: string; quantity: number; price: number}>;
}) => {
  return `
    <!DOCTYPE html>
    <html>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #16a34a;">¡Pedido Confirmado!</h2>
            
            <p>Hola ${data.customerName},</p>
            
            <p>Gracias por tu compra. Tu pedido <strong>#${data.orderNumber}</strong> ha sido creado exitosamente.</p>
            
            <div style="background: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3>Resumen del Pedido:</h3>
                ${data.items.map(item => `
                    <div style="display: flex; justify-content: space-between; margin: 10px 0;">
                        <span>${item.name} (x${item.quantity})</span>
                        <span>$${(item.price * item.quantity).toFixed(2)}</span>
                    </div>
                `).join('')}
                <hr>
                <div style="display: flex; justify-content: space-between; font-weight: bold;">
                    <span>Total:</span>
                    <span>$${data.total.toFixed(2)}</span>
                </div>
            </div>
            
            <p>Te mantendremos informado sobre el estado de tu pedido.</p>
            
            <p>Gracias por confiar en ServiPro Garcia LLC.</p>
        </div>
    </body>
    </html>
  `;
};

export const forgotPasswordTemplate = (data: {
  customerName: string;
  resetLink: string;
  expiresIn: string;
}) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <title>Recuperar Contraseña</title>
    </head>
    <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
        <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #dc2626;">Recuperar Contraseña</h2>
            
            <p>Hola ${data.customerName},</p>
            
            <p>Recibimos una solicitud para restablecer tu contraseña de ServiPro Garcia.</p>
            
            <div style="background: #fef3c7; border: 1px solid #fbbf24; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0;"><strong>Haz clic en el siguiente enlace para crear una nueva contraseña:</strong></p>
            </div>
            
            <div style="text-align: center; margin: 30px 0;">
                <a href="${data.resetLink}" 
                   style="background: #dc2626; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
                    Restablecer Contraseña
                </a>
            </div>
            
            <p><strong>Este enlace expira en ${data.expiresIn}.</strong></p>
            
            <p>Si no solicitaste este cambio, puedes ignorar este email de forma segura.</p>
            
            <p>Por tu seguridad, nunca compartas este enlace con nadie.</p>
            
            <p>Gracias por confiar en ServiPro Garcia LLC.</p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
                <p style="font-size: 12px; color: #6b7280;">
                    Si el botón no funciona, copia y pega este enlace: ${data.resetLink}
                </p>
            </div>
        </div>
    </body>
    </html>
  `;  
};

// Agregar al final del archivo, antes del cierre

export const newsletterTemplate = {
  // Template de bienvenida
  welcome: (data: {
    name: string;
    discountCode?: string;
    isReactivation?: boolean;
  }) => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <title>${data.isReactivation ? 'Bienvenido de vuelta' : '¡Bienvenido!'}</title>
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f4f4f4; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: white; padding: 0; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <!-- Header -->
              <div style="background: linear-gradient(135deg, #16a34a 0%, #fbbf24 100%); padding: 30px; text-align: center;">
                  <h1 style="color: white; margin: 0; font-size: 28px;">
                    ${data.isReactivation ? '¡Bienvenido de vuelta!' : '¡Bienvenido a ServiPro Garcia!'}
                  </h1>
              </div>
              
              <!-- Content -->
              <div style="padding: 30px;">
                  <p style="font-size: 18px; color: #333;">Hola <strong>${data.name}</strong>,</p>
                  
                  <p style="font-size: 16px; color: #666;">
                    ${data.isReactivation 
                      ? 'Nos alegra tenerte de vuelta en nuestra comunidad.' 
                      : 'Gracias por suscribirte a nuestro newsletter.'}
                  </p>
                  
                  ${data.discountCode ? `
                    <div style="background: #fef3c7; border: 2px solid #fbbf24; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
                        <h2 style="color: #d97706; margin: 0 0 10px 0;">🎁 Regalo de Bienvenida</h2>
                        <p style="margin: 10px 0;">Usa este código para obtener <strong>15% de descuento</strong> en tu primera compra:</p>
                        <div style="background: white; padding: 15px; border-radius: 5px; margin: 15px 0;">
                            <code style="font-size: 24px; font-weight: bold; color: #16a34a; letter-spacing: 2px;">
                                ${data.discountCode}
                            </code>
                        </div>
                        <p style="font-size: 14px; color: #666; margin: 0;">Válido por 30 días</p>
                    </div>
                  ` : ''}
                  
                  <h3 style="color: #16a34a; margin-top: 30px;">Qué esperar de nosotros:</h3>
                  <ul style="color: #666; font-size: 16px; line-height: 1.8;">
                      <li>🎯 Ofertas exclusivas solo para suscriptores</li>
                      <li>🆕 Primeros en conocer nuevos productos</li>
                      <li>💡 Tips y recomendaciones personalizadas</li>
                      <li>🎉 Invitaciones a eventos especiales</li>
                      <li>🏷️ Descuentos y cupones especiales</li>
                  </ul>
                  
                  <div style="text-align: center; margin: 30px 0;">
                      <a href="${process.env.FRONTEND_URL}/products" 
                         style="background: linear-gradient(135deg, #16a34a 0%, #22c55e 100%); 
                                color: white; 
                                padding: 15px 40px; 
                                text-decoration: none; 
                                border-radius: 8px; 
                                font-size: 18px; 
                                font-weight: bold; 
                                display: inline-block;
                                box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                          Explorar Productos
                      </a>
                  </div>
              </div>
              
              <!-- Footer -->
              <div style="background: #f9fafb; padding: 20px; text-align: center; border-top: 1px solid #e5e7eb;">
                  <p style="color: #6b7280; font-size: 14px; margin: 0;">
                      © 2024 ServiPro Garcia LLC. Todos los derechos reservados.
                  </p>
                  <p style="color: #9ca3af; font-size: 12px; margin: 10px 0 0 0;">
                      Si no deseas recibir más emails, puedes 
                      <a href="${process.env.FRONTEND_URL}/newsletter/unsubscribe" style="color: #16a34a;">desuscribirte aquí</a>
                  </p>
              </div>
          </div>
      </body>
      </html>
    `;
  },

  // Template de campaña
  campaign: (data: {
    subject: string;
    previewText: string;
    content: string; // HTML content
    subscriberName: string;
    subscriberEmail: string;
    unsubscribeUrl: string;
  }) => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <title>${data.subject}</title>
          <meta name="description" content="${data.previewText}">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; background: #f4f4f4; padding: 20px;">
          <div style="max-width: 600px; margin: 0 auto; background: white; padding: 0; border-radius: 10px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <!-- Header -->
              <div style="background: linear-gradient(135deg, #16a34a 0%, #fbbf24 100%); padding: 20px; text-align: center;">
                  <img src="${process.env.FRONTEND_URL}/logo.png" 
                       alt="ServiPro Garcia" 
                       style="height: 60px; width: auto; margin-bottom: 10px;">
                  <h2 style="color: white; margin: 0; font-size: 24px;">ServiPro Garcia Newsletter</h2>
              </div>
              
              <!-- Content -->
              <div style="padding: 30px;">
                  ${data.content}
              </div>
              
              <!-- Footer -->
              <div style="background: #f9fafb; padding: 20px; border-top: 1px solid #e5e7eb;">
                  <div style="text-align: center; margin-bottom: 20px;">
                      <a href="${process.env.FRONTEND_URL}" 
                         style="color: #16a34a; text-decoration: none; font-weight: bold; margin: 0 10px;">
                          Visitar Tienda
                      </a>
                      <span style="color: #cbd5e1;">|</span>
                      <a href="${process.env.FRONTEND_URL}/account" 
                         style="color: #16a34a; text-decoration: none; font-weight: bold; margin: 0 10px;">
                          Mi Cuenta
                      </a>
                      <span style="color: #cbd5e1;">|</span>
                      <a href="${process.env.FRONTEND_URL}/products" 
                         style="color: #16a34a; text-decoration: none; font-weight: bold; margin: 0 10px;">
                          Ver Productos
                      </a>
                  </div>
                  
                  <p style="color: #6b7280; font-size: 14px; margin: 10px 0; text-align: center;">
                      © 2024 ServiPro Garcia LLC. Todos los derechos reservados.
                  </p>
                  
                  <p style="color: #9ca3af; font-size: 12px; margin: 10px 0 0 0; text-align: center;">
                      Este email fue enviado a ${data.subscriberEmail}<br>
                      <a href="${data.unsubscribeUrl}" 
                         style="color: #16a34a; text-decoration: underline;">
                          Desuscribirse
                      </a> | 
                      <a href="${process.env.FRONTEND_URL}/newsletter/preferences" 
                         style="color: #16a34a; text-decoration: underline;">
                          Preferencias de Email
                      </a>
                  </p>
              </div>
          </div>
      </body>
      </html>
    `;
  }
};