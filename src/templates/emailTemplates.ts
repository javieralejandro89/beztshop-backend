// Colores del tema Dark Tech
const colors = {
  darkbg: '#1F1F1F',
  darkbgLight: '#2A2A2A',
  gold: '#FFD700',
  cyan: '#00CED1',
  white: '#FFFFFF',
  gray: '#9CA3AF',
  grayDark: '#6B7280',
  green: '#10B981',
  red: '#EF4444',
  blue: '#3B82F6'
};

const baseStyles = `
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
    line-height: 1.6;
    color: ${colors.white};
    background: ${colors.darkbg};
    margin: 0;
    padding: 0;
  }
  .container {
    max-width: 600px;
    margin: 0 auto;
    background: linear-gradient(135deg, ${colors.darkbg} 0%, ${colors.darkbgLight} 100%);
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  }
  .header {
    background: linear-gradient(135deg, ${colors.gold} 0%, ${colors.cyan} 100%);
    padding: 40px 30px;
    text-align: center;
    position: relative;
  }
  .header::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: url('data:image/svg+xml,<svg width="100" height="100" xmlns="http://www.w3.org/2000/svg"><defs><pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse"><path d="M 20 0 L 0 0 0 20" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/></pattern></defs><rect width="100" height="100" fill="url(%23grid)"/></svg>');
    opacity: 0.3;
  }
  .content {
    padding: 40px 30px;
  }
  .button {
    display: inline-block;
    background: linear-gradient(135deg, ${colors.gold} 0%, ${colors.cyan} 100%);
    color: ${colors.darkbg};
    padding: 16px 32px;
    text-decoration: none;
    border-radius: 8px;
    font-weight: bold;
    font-size: 16px;
    box-shadow: 0 4px 15px rgba(255, 215, 0, 0.4);
    transition: transform 0.2s;
  }
  .card {
    background: ${colors.darkbgLight};
    border: 1px solid rgba(255, 215, 0, 0.2);
    border-radius: 8px;
    padding: 20px;
    margin: 20px 0;
  }
  .footer {
    background: ${colors.darkbgLight};
    padding: 30px;
    text-align: center;
    border-top: 1px solid rgba(255, 215, 0, 0.1);
  }
`;

export const orderStatusTemplate = (data: {
  customerName: string;
  orderNumber: string;
  status: string;
  trackingNumber?: string;
  notes?: string;
}) => {
  const statusConfig = {
    CONFIRMED: { 
      emoji: '✅', 
      message: 'Tu pedido ha sido confirmado y está siendo preparado.',
      color: colors.green 
    },
    PROCESSING: { 
      emoji: '⚙️', 
      message: 'Tu pedido está siendo procesado.',
      color: colors.blue 
    },
    SHIPPED: { 
      emoji: '🚚', 
      message: 'Tu pedido está en camino.',
      color: colors.cyan 
    },
    DELIVERED: { 
      emoji: '📦', 
      message: '¡Tu pedido ha sido entregado!',
      color: colors.green 
    },
    CANCELLED: { 
      emoji: '❌', 
      message: 'Tu pedido ha sido cancelado.',
      color: colors.red 
    }
  };

  const config = statusConfig[data.status as keyof typeof statusConfig] || {
    emoji: '📋',
    message: 'Tu pedido ha sido actualizado.',
    color: colors.gray
  };

  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Actualización de Pedido - BeztShop</title>
        <style>${baseStyles}</style>
    </head>
    <body>
        <div style="padding: 20px;">
            <div class="container">
                <!-- Header Dark Tech -->
                <div class="header">
                    <div style="position: relative; z-index: 1;">
                        <h1 style="color: ${colors.darkbg}; margin: 0; font-size: 32px; font-weight: 900; text-shadow: 2px 2px 4px rgba(0,0,0,0.2);">
                            BeztShop
                        </h1>
                        <p style="color: ${colors.darkbg}; margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">
                            TECH STORE PREMIUM
                        </p>
                    </div>
                </div>
                
                <!-- Content -->
                <div class="content">
                    <h2 style="color: ${colors.gold}; margin: 0 0 20px 0; font-size: 24px;">
                        ${config.emoji} Actualización de Pedido
                    </h2>
                    
                    <p style="color: ${colors.white}; font-size: 16px;">
                        Hola <strong style="color: ${colors.gold};">${data.customerName}</strong>,
                    </p>
                    
                    <p style="color: ${colors.gray}; font-size: 16px;">
                        Tu pedido <strong style="color: ${colors.cyan};">#${data.orderNumber}</strong> ha sido actualizado.
                    </p>
                    
                    <!-- Status Card -->
                    <div class="card" style="border-left: 4px solid ${config.color};">
                        <div style="display: flex; align-items: center; margin-bottom: 15px;">
                            <div style="font-size: 48px; margin-right: 20px;">${config.emoji}</div>
                            <div>
                                <h3 style="margin: 0; color: ${config.color}; font-size: 20px;">
                                    Estado: ${data.status}
                                </h3>
                                <p style="margin: 5px 0 0 0; color: ${colors.gray}; font-size: 14px;">
                                    ${config.message}
                                </p>
                            </div>
                        </div>
                        
                        ${data.trackingNumber ? `
                            <div style="background: ${colors.darkbg}; padding: 15px; border-radius: 6px; margin-top: 15px;">
                                <p style="margin: 0 0 5px 0; color: ${colors.gray}; font-size: 12px;">
                                    Número de seguimiento:
                                </p>
                                <p style="margin: 0; color: ${colors.gold}; font-size: 18px; font-weight: bold; letter-spacing: 1px;">
                                    ${data.trackingNumber}
                                </p>
                            </div>
                        ` : ''}
                        
                        ${data.notes ? `
                            <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid rgba(255,215,0,0.1);">
                                <p style="margin: 0 0 5px 0; color: ${colors.gray}; font-size: 12px;">
                                    Notas adicionales:
                                </p>
                                <p style="margin: 0; color: ${colors.white}; font-size: 14px;">
                                    ${data.notes}
                                </p>
                            </div>
                        ` : ''}
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.FRONTEND_URL}/account/orders" class="button">
                            Ver Detalles del Pedido
                        </a>
                    </div>
                    
                    <div style="background: rgba(0,206,209,0.1); border: 1px solid rgba(0,206,209,0.3); border-radius: 8px; padding: 15px; margin-top: 20px;">
                        <p style="margin: 0; color: ${colors.cyan}; font-size: 14px; text-align: center;">
                            💡 <strong>Tip:</strong> Guarda este número de pedido para futuras referencias
                        </p>
                    </div>
                </div>
                
                <!-- Footer -->
                <div class="footer">
                    <p style="color: ${colors.gray}; font-size: 14px; margin: 0 0 10px 0;">
                        Gracias por comprar en <strong style="color: ${colors.gold};">BeztShop</strong>
                    </p>
                    
                    <div style="margin: 20px 0;">
                        <a href="${process.env.FRONTEND_URL}" style="color: ${colors.cyan}; text-decoration: none; margin: 0 10px;">Inicio</a>
                        <span style="color: ${colors.grayDark};">•</span>
                        <a href="${process.env.FRONTEND_URL}/products" style="color: ${colors.cyan}; text-decoration: none; margin: 0 10px;">Productos</a>
                        <span style="color: ${colors.grayDark};">•</span>
                        <a href="${process.env.FRONTEND_URL}/account" style="color: ${colors.cyan}; text-decoration: none; margin: 0 10px;">Mi Cuenta</a>
                    </div>
                    
                    <p style="color: ${colors.grayDark}; font-size: 12px; margin: 20px 0 0 0;">
                        Este es un email automático, por favor no respondas.<br>
                        © 2025 BeztShop. Tech Store Premium. Todos los derechos reservados.
                    </p>
                </div>
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
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Pedido Confirmado - BeztShop</title>
        <style>${baseStyles}</style>
    </head>
    <body>
        <div style="padding: 20px;">
            <div class="container">
                <!-- Header -->
                <div class="header">
                    <div style="position: relative; z-index: 1;">
                        <div style="font-size: 64px; margin-bottom: 10px;">✅</div>
                        <h1 style="color: ${colors.darkbg}; margin: 0; font-size: 32px; font-weight: 900;">
                            ¡Pedido Confirmado!
                        </h1>
                        <p style="color: ${colors.darkbg}; margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">
                            Gracias por tu compra en BeztShop
                        </p>
                    </div>
                </div>
                
                <!-- Content -->
                <div class="content">
                    <p style="color: ${colors.white}; font-size: 18px; margin: 0 0 10px 0;">
                        Hola <strong style="color: ${colors.gold};">${data.customerName}</strong>,
                    </p>
                    
                    <p style="color: ${colors.gray}; font-size: 16px;">
                        Tu pedido <strong style="color: ${colors.cyan};">#${data.orderNumber}</strong> ha sido confirmado y está siendo procesado.
                    </p>
                    
                    <!-- Order Summary Card -->
                    <div class="card">
                        <h3 style="color: ${colors.gold}; margin: 0 0 20px 0; font-size: 18px; border-bottom: 2px solid rgba(255,215,0,0.2); padding-bottom: 10px;">
                            📦 Resumen del Pedido
                        </h3>
                        
                        ${data.items.map(item => `
                            <div style="display: flex; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid rgba(255,215,0,0.1);">
                                <div style="flex: 1;">
                                    <p style="margin: 0; color: ${colors.white}; font-size: 15px;">
                                        ${item.name}
                                    </p>
                                    <p style="margin: 5px 0 0 0; color: ${colors.gray}; font-size: 13px;">
                                        Cantidad: ${item.quantity}
                                    </p>
                                </div>
                                <div style="text-align: right;">
                                    <p style="margin: 0; color: ${colors.cyan}; font-size: 16px; font-weight: bold;">
                                        $${(item.price * item.quantity).toFixed(2)} MXN
                                    </p>
                                </div>
                            </div>
                        `).join('')}
                        
                        <div style="display: flex; justify-content: space-between; padding: 20px 0 0 0; margin-top: 15px; border-top: 2px solid ${colors.gold};">
                            <p style="margin: 0; color: ${colors.white}; font-size: 20px; font-weight: bold;">
                                Total:
                            </p>
                            <p style="margin: 0; background: linear-gradient(135deg, ${colors.gold} 0%, ${colors.cyan} 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; font-size: 24px; font-weight: bold;">
                                $${data.total.toFixed(2)} MXN
                            </p>
                        </div>
                    </div>
                    
                    <!-- Next Steps -->
                    <div style="background: ${colors.darkbgLight}; border-radius: 8px; padding: 20px; margin: 20px 0;">
                        <h3 style="color: ${colors.cyan}; margin: 0 0 15px 0; font-size: 16px;">
                            🚀 Próximos pasos:
                        </h3>
                        <ul style="margin: 0; padding-left: 20px; color: ${colors.gray};">
                            <li style="margin-bottom: 10px;">Estamos preparando tu pedido</li>
                            <li style="margin-bottom: 10px;">Recibirás un email cuando sea enviado</li>
                            <li style="margin-bottom: 10px;">Podrás rastrear tu envío en tiempo real</li>
                            <li>Estimado de entrega: 3-7 días hábiles</li>
                        </ul>
                    </div>
                    
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.FRONTEND_URL}/account/orders" class="button">
                            Rastrear mi Pedido
                        </a>
                    </div>
                    
                    <!-- Support -->
                    <div style="background: rgba(0,206,209,0.1); border: 1px solid rgba(0,206,209,0.3); border-radius: 8px; padding: 15px; text-align: center;">
                        <p style="margin: 0; color: ${colors.cyan}; font-size: 14px;">
                            💬 ¿Necesitas ayuda? Nuestro equipo está disponible 24/7<br>
                            <a href="mailto:soporte@beztshop.com" style="color: ${colors.gold}; text-decoration: none;">soporte@beztshop.com</a>
                        </p>
                    </div>
                </div>
                
                <!-- Footer -->
                <div class="footer">
                    <p style="color: ${colors.gray}; font-size: 14px; margin: 0 0 15px 0;">
                        Gracias por confiar en <strong style="color: ${colors.gold};">BeztShop</strong>
                    </p>
                    
                    <div style="margin: 20px 0;">
                        <a href="${process.env.FRONTEND_URL}" style="color: ${colors.cyan}; text-decoration: none; margin: 0 10px;">Inicio</a>
                        <span style="color: ${colors.grayDark};">•</span>
                        <a href="${process.env.FRONTEND_URL}/products" style="color: ${colors.cyan}; text-decoration: none; margin: 0 10px;">Productos</a>
                        <span style="color: ${colors.grayDark};">•</span>
                        <a href="${process.env.FRONTEND_URL}/account" style="color: ${colors.cyan}; text-decoration: none; margin: 0 10px;">Mi Cuenta</a>
                    </div>
                    
                    <p style="color: ${colors.grayDark}; font-size: 12px; margin: 20px 0 0 0;">
                        © 2025 BeztShop. Tech Store Premium. Todos los derechos reservados.
                    </p>
                </div>
            </div>
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
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Recuperar Contraseña - BeztShop</title>
        <style>${baseStyles}</style>
    </head>
    <body>
        <div style="padding: 20px;">
            <div class="container">
                <!-- Header -->
                <div class="header">
                    <div style="position: relative; z-index: 1;">
                        <div style="font-size: 64px; margin-bottom: 10px;">🔐</div>
                        <h1 style="color: ${colors.darkbg}; margin: 0; font-size: 32px; font-weight: 900;">
                            Recuperar Contraseña
                        </h1>
                        <p style="color: ${colors.darkbg}; margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">
                            Restablece tu acceso a BeztShop
                        </p>
                    </div>
                </div>
                
                <!-- Content -->
                <div class="content">
                    <p style="color: ${colors.white}; font-size: 18px; margin: 0 0 10px 0;">
                        Hola <strong style="color: ${colors.gold};">${data.customerName}</strong>,
                    </p>
                    
                    <p style="color: ${colors.gray}; font-size: 16px;">
                        Recibimos una solicitud para restablecer la contraseña de tu cuenta en BeztShop.
                    </p>
                    
                    <!-- Warning Box -->
                    <div style="background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.3); border-radius: 8px; padding: 15px; margin: 20px 0;">
                        <p style="margin: 0; color: ${colors.red}; font-size: 14px;">
                            ⚠️ <strong>Importante:</strong> Este enlace expira en <strong>${data.expiresIn}</strong>
                        </p>
                    </div>
                    
                    <!-- Reset Button -->
                    <div style="text-align: center; margin: 40px 0;">
                        <a href="${data.resetLink}" class="button" style="font-size: 18px; padding: 18px 40px;">
                            🔑 Restablecer Contraseña
                        </a>
                    </div>
                    
                    <!-- Security Info -->
                    <div class="card">
                        <h3 style="color: ${colors.cyan}; margin: 0 0 15px 0; font-size: 16px;">
                            🛡️ Consejos de Seguridad:
                        </h3>
                        <ul style="margin: 0; padding-left: 20px; color: ${colors.gray}; font-size: 14px;">
                            <li style="margin-bottom: 8px;">Nunca compartas este enlace con nadie</li>
                            <li style="margin-bottom: 8px;">Usa una contraseña única y segura</li>
                            <li style="margin-bottom: 8px;">Combina letras, números y símbolos</li>
                            <li>Si no solicitaste esto, ignora este email</li>
                        </ul>
                    </div>
                    
                    <!-- Link fallback -->
                    <div style="background: ${colors.darkbgLight}; border-radius: 8px; padding: 15px; margin-top: 20px;">
                        <p style="margin: 0 0 5px 0; color: ${colors.gray}; font-size: 12px;">
                            Si el botón no funciona, copia y pega este enlace:
                        </p>
                        <p style="margin: 0; word-break: break-all; color: ${colors.cyan}; font-size: 12px;">
                            ${data.resetLink}
                        </p>
                    </div>
                </div>
                
                <!-- Footer -->
                <div class="footer">
                    <p style="color: ${colors.grayDark}; font-size: 12px; margin: 0;">
                        Este email fue generado automáticamente.<br>
                        Si no solicitaste restablecer tu contraseña, ignora este mensaje.<br><br>
                        © 2025 BeztShop. Tech Store Premium.
                    </p>
                </div>
            </div>
        </div>
    </body>
    </html>
  `;  
};

export const newsletterTemplate = {
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
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${data.isReactivation ? 'Bienvenido de vuelta' : '¡Bienvenido a BeztShop!'}</title>
          <style>${baseStyles}</style>
      </head>
      <body>
          <div style="padding: 20px;">
              <div class="container">
                  <!-- Header -->
                  <div class="header">
                      <div style="position: relative; z-index: 1;">
                          <div style="font-size: 64px; margin-bottom: 10px;">${data.isReactivation ? '👋' : '🎉'}</div>
                          <h1 style="color: ${colors.darkbg}; margin: 0; font-size: 36px; font-weight: 900;">
                              ${data.isReactivation ? '¡Bienvenido de vuelta!' : '¡Bienvenido a BeztShop!'}
                          </h1>
                          <p style="color: ${colors.darkbg}; margin: 10px 0 0 0; font-size: 16px; opacity: 0.9;">
                              Tu tienda tech premium
                          </p>
                      </div>
                  </div>
                  
                  <!-- Content -->
                  <div class="content">
                      <p style="color: ${colors.white}; font-size: 20px; margin: 0 0 10px 0;">
                          Hola <strong style="color: ${colors.gold};">${data.name}</strong>,
                      </p>
                      
                      <p style="color: ${colors.gray}; font-size: 16px;">
                          ${data.isReactivation 
                            ? 'Nos alegra mucho tenerte de vuelta en nuestra comunidad tech. ¡Te hemos extrañado!' 
                            : 'Gracias por unirte a nuestra newsletter. Estás a punto de descubrir las mejores ofertas en tecnología.'}
                      </p>
                      
                      ${data.discountCode ? `
                          <!-- Discount Card -->
                          <div style="background: linear-gradient(135deg, ${colors.gold} 0%, ${colors.cyan} 100%); border-radius: 12px; padding: 30px; margin: 30px 0; text-align: center; box-shadow: 0 10px 30px rgba(255,215,0,0.3);">
                              <h2 style="color: ${colors.darkbg}; margin: 0 0 15px 0; font-size: 28px; font-weight: 900;">
                                  🎁 Regalo de Bienvenida
                              </h2>
                              <p style="color: ${colors.darkbg}; margin: 0 0 20px 0; font-size: 16px; opacity: 0.9;">
                                  ¡Usa este código y obtén <strong>15% OFF</strong> en tu primera compra!
                              </p>
                              <div style="background: ${colors.darkbg}; padding: 20px; border-radius: 8px; margin: 0 auto; max-width: 300px; border: 2px dashed rgba(255,215,0,0.5);">
                                  <code style="font-size: 32px; font-weight: bold; color: ${colors.gold}; letter-spacing: 3px; font-family: 'Courier New', monospace;">
                                      ${data.discountCode}
                                  </code>
                              </div>
                              <p style="color: ${colors.darkbg}; margin: 20px 0 0 0; font-size: 14px; opacity: 0.8;">
                                  ⏰ Válido por 30 días
                              </p>
                          </div>
                      ` : ''}
                      
                      <!-- Benefits -->
                      <div class="card">
                          <h3 style="color: ${colors.gold}; margin: 0 0 20px 0; font-size: 20px;">
                              ⚡ Qué obtienes al suscribirte:
                          </h3>
                          <div style="space-y: 15px;">
                              ${[
                                { icon: '🎯', text: 'Ofertas exclusivas solo para suscriptores' },
                                { icon: '🆕', text: 'Acceso anticipado a nuevos productos' },
                                { icon: '💡', text: 'Tips tech y recomendaciones personalizadas' },
                                { icon: '🎉', text: 'Invitaciones a eventos y lanzamientos' },
                                { icon: '🏷️', text: 'Cupones y descuentos especiales mensuales' }
                              ].map(benefit => `
                                <div style="display: flex; align-items: center; padding: 12px 0; border-bottom: 1px solid rgba(255,215,0,0.1);">
                                    <div style="font-size: 24px; margin-right: 15px;">${benefit.icon}</div>
                                    <p style="margin: 0; color: ${colors.gray}; font-size: 15px;">${benefit.text}</p>
                                </div>
                              `).join('')}
                          </div>
                      </div>
                      
                      <!-- CTA -->
                      <div style="text-align: center; margin: 40px 0;">
                          <a href="${process.env.FRONTEND_URL}/products" class="button" style="font-size: 18px; padding: 18px 40px;">
                              🚀 Explorar Productos
                          </a>
                      </div>
                      
                      <!-- Social -->
                      <div style="text-align: center; margin: 30px 0;">
                          <p style="color: ${colors.gray}; font-size: 14px; margin-bottom: 15px;">
                              Síguenos en redes sociales:
                          </p>
                          <div>
                              <a href="#" style="display: inline-block; margin: 0 10px; color: ${colors.cyan}; text-decoration: none; font-size: 24px;">📘</a>
                              <a href="#" style="display: inline-block; margin: 0 10px; color: ${colors.cyan}; text-decoration: none; font-size: 24px;">📷</a>
                              <a href="#" style="display: inline-block; margin: 0 10px; color: ${colors.cyan}; text-decoration: none; font-size: 24px;">🐦</a>
                          </div>
                      </div>
                  </div>
                  
                  <!-- Footer -->
                  <div class="footer">
                      <p style="color: ${colors.gray}; font-size: 14px; margin: 0 0 15px 0;">
                          Bienvenido a <strong style="color: ${colors.gold};">BeztShop</strong> - Tu tienda tech premium
                      </p>
                      <p style="color: ${colors.grayDark}; font-size: 12px; margin: 0;">
                          © 2025 BeztShop. Todos los derechos reservados.<br>
                          <a href="${process.env.FRONTEND_URL}/newsletter/unsubscribe" style="color: ${colors.cyan}; text-decoration: none;">Desuscribirse</a>
                      </p>
                  </div>
              </div>
          </div>
      </body>
      </html>
    `;
  },

  campaign: (data: {
    subject: string;
    previewText: string;
    content: string;
    subscriberName: string;
    subscriberEmail: string;
    unsubscribeUrl: string;
  }) => {
    return `
      <!DOCTYPE html>
      <html>
      <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>${data.subject}</title>
          <meta name="description" content="${data.previewText}">
          <style>${baseStyles}</style>
      </head>
      <body>
          <div style="padding: 20px;">
              <div class="container">
                  <!-- Header -->
                  <div class="header">
                      <div style="position: relative; z-index: 1;">
                          <h1 style="color: ${colors.darkbg}; margin: 0; font-size: 32px; font-weight: 900;">
                              BeztShop
                          </h1>
                          <p style="color: ${colors.darkbg}; margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">
                              TECH STORE PREMIUM
                          </p>
                      </div>
                  </div>
                  
                  <!-- Content -->
                  <div class="content">
                      ${data.content}
                  </div>
                  
                  <!-- Footer -->
                  <div class="footer">
                      <div style="margin-bottom: 20px;">
                          <a href="${process.env.FRONTEND_URL}" style="color: ${colors.cyan}; text-decoration: none; margin: 0 10px;">Inicio</a>
                          <span style="color: ${colors.grayDark};">•</span>
                          <a href="${process.env.FRONTEND_URL}/products" style="color: ${colors.cyan}; text-decoration: none; margin: 0 10px;">Productos</a>
                          <span style="color: ${colors.grayDark};">•</span>
                          <a href="${process.env.FRONTEND_URL}/account" style="color: ${colors.cyan}; text-decoration: none; margin: 0 10px;">Mi Cuenta</a>
                      </div>
                      
                      <p style="color: ${colors.gray}; font-size: 12px; margin: 10px 0;">
                          Este email fue enviado a ${data.subscriberEmail}
                      </p>
                      
                      <p style="color: ${colors.grayDark}; font-size: 12px; margin: 10px 0 0 0;">
                          <a href="${data.unsubscribeUrl}" style="color: ${colors.cyan}; text-decoration: none;">Desuscribirse</a>
                          <span style="color: ${colors.grayDark};"> • </span>
                          <a href="${process.env.FRONTEND_URL}/newsletter/preferences" style="color: ${colors.cyan}; text-decoration: none;">Preferencias</a>
                          <br><br>
                          © 2025 BeztShop. Tech Store Premium.
                      </p>
                  </div>
              </div>
          </div>
      </body>
      </html>
    `;
  }
};

export const newReviewNotificationTemplate = (data: {
  productName: string;
  customerName: string;
  rating: number;
  comment: string;
  reviewId: string;
}) => {
  const stars = '⭐'.repeat(data.rating) + '☆'.repeat(5 - data.rating);
  
  return `
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nueva Reseña - BeztShop Admin</title>
        <style>${baseStyles}</style>
    </head>
    <body>
        <div style="padding: 20px;">
            <div class="container">
                <!-- Header -->
                <div class="header">
                    <div style="position: relative; z-index: 1;">
                        <div style="font-size: 64px; margin-bottom: 10px;">⭐</div>
                        <h1 style="color: ${colors.darkbg}; margin: 0; font-size: 32px; font-weight: 900;">
                            Nueva Reseña
                        </h1>
                        <p style="color: ${colors.darkbg}; margin: 10px 0 0 0; font-size: 14px; opacity: 0.9;">
                            Panel de Administración
                        </p>
                    </div>
                </div>
                
                <!-- Content -->
                <div class="content">
                    <p style="color: ${colors.white}; font-size: 16px;">
                        Se ha recibido una nueva reseña que requiere tu revisión:
                    </p>
                    
                    <!-- Review Card -->
                    <div class="card">
                        <h3 style="color: ${colors.gold}; margin: 0 0 15px 0; font-size: 18px;">
                            📦 ${data.productName}
                        </h3>
                        
                        <div style="border-left: 4px solid ${colors.cyan}; padding-left: 15px; margin: 20px 0;">
                            <p style="margin: 0 0 10px 0; color: ${colors.gray}; font-size: 14px;">
                                Cliente: <strong style="color: ${colors.white};">${data.customerName}</strong>
                            </p>
                            <p style="margin: 0 0 10px 0; color: ${colors.gray}; font-size: 14px;">
                                Calificación: <span style="font-size: 20px;">${stars}</span> <strong style="color: ${colors.gold};">(${data.rating}/5)</strong>
                            </p>
                        </div>
                        
                        <div style="background: ${colors.darkbg}; padding: 20px; border-radius: 8px; border-left: 4px solid ${colors.gold};">
                            <p style="margin: 0 0 5px 0; color: ${colors.gray}; font-size: 12px;">
                                Comentario:
                            </p>
                            <p style="margin: 0; color: ${colors.white}; font-size: 15px; line-height: 1.6;">
                                ${data.comment}
                            </p>
                        </div>
                    </div>
                    
                    <!-- CTA -->
                    <div style="text-align: center; margin: 30px 0;">
                        <a href="${process.env.FRONTEND_URL}/admin/settings/reviews" class="button">
                            👁️ Ver y Aprobar Reseña
                        </a>
                    </div>
                </div>
                
                <!-- Footer -->
                <div class="footer">
                    <p style="color: ${colors.grayDark}; font-size: 12px; margin: 0;">
                        Notificación automática del sistema de administración de BeztShop<br>
                        © 2025 BeztShop Admin Panel
                    </p>
                </div>
            </div>
        </div>
    </body>
    </html>
  `;
};