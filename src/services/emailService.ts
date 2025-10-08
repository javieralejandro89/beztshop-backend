import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
  from?: string;
}

export interface EmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

export const emailService = {
  async sendEmail({ to, subject, html, from }: EmailOptions): Promise<EmailResult> {
    try {
      // ✅ Validaciones previas
      if (!process.env.RESEND_API_KEY) {
        throw new Error('RESEND_API_KEY no está configurado');
      }

      if (!to || !subject || !html) {
        throw new Error('Faltan campos requeridos: to, subject, html');
      }

      // ✅ LÓGICA CORREGIDA para construir el FROM
      let fromEmail: string;
      
      if (from) {
        // Si se proporciona un 'from' específico, usarlo tal como viene
        fromEmail = from;
      } else {
        // Construir el email FROM por defecto
        const defaultEmail = process.env.FROM_EMAIL || 'atencionalcliente@beztshop.com';
        
        // Verificar si ya tiene formato de nombre + email
        if (defaultEmail.includes('<') && defaultEmail.includes('>')) {
          // Ya tiene formato "Nombre <email@domain.com>"
          fromEmail = defaultEmail;
        } else {
          // Solo es un email, agregar el nombre
          fromEmail = `BeztShop <${defaultEmail}>`;
        }
      }

      // ✅ Validar formato del email extraído
      const emailOnly = fromEmail.includes('<') 
        ? fromEmail.split('<')[1].replace('>', '') 
        : fromEmail;
        
      if (!emailOnly.endsWith('@beztshop.com')) {
        console.warn(`⚠️  FROM email ${emailOnly} no usa dominio verificado. Usando atencionalcliente@beztshop.com`);
        fromEmail = 'BeztShop <atencionalcliente@beztshop.com>';
      }

      console.log(`📧 Enviando email a: ${to} desde: ${fromEmail}`);
      
      const result = await resend.emails.send({
        from: fromEmail,
        to: [to],
        subject,
        html
      });

      if (result.error) {
        console.error('❌ Error de Resend:', result.error);
        return {
          success: false,
          error: result.error.message
        };
      }
      
      console.log('✅ Email enviado exitosamente:', {
        id: result.data?.id,
        to,
        subject
      });
      
      return {
        success: true,
        id: result.data?.id
      };

    } catch (error: any) {
      console.error('❌ Error enviando email:', {
        error: error.message,
        to,
        subject,
        stack: error.stack
      });
      
      return {
        success: false,
        error: error.message
      };
    }
  },

  // ✅ Método para verificar configuración
  async testConfiguration(): Promise<boolean> {
    try {
      if (!process.env.RESEND_API_KEY) {
        console.error('❌ RESEND_API_KEY no configurado');
        return false;
      }

      if (!process.env.FROM_EMAIL) {
        console.warn('⚠️  FROM_EMAIL no configurado, usando fallback');
      }

      console.log('✅ Configuración de email OK');
      return true;

    } catch (error) {
      console.error('❌ Error en configuración de email:', error);
      return false;
    }
  }
};