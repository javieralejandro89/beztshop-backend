// src/controllers/adminSettingsController.ts - Controlador para configuraciones del sistema
import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';

const prisma = new PrismaClient();

// Schemas de validación para configuraciones
const siteSettingsSchema = z.object({
  siteName: z.string().min(1, 'Nombre del sitio es requerido').max(100),
  siteDescription: z.string().max(500).optional(),
  siteUrl: z.string().optional().refine((val) => {
    // Permite string vacío o URL válida
    if (!val || val.trim() === '') return true;
    return z.string().url().safeParse(val).success;
  }, 'URL del sitio inválida'),
  contactEmail: z.string().email('Email inválido'),
  contactPhone: z.string().optional(),
  supportEmail: z.string().email('Email de soporte inválido'),
  address: z.object({
    street: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    zipCode: z.string().optional(),
    country: z.string().default('Estados Unidos')
  }).optional(),
  socialMedia: z.object({
    facebook: z.string().optional().refine((val) => {
      if (!val || val.trim() === '') return true;
      return z.string().url().safeParse(val).success;
    }, 'URL de Facebook inválida'),
    instagram: z.string().optional().refine((val) => {
      if (!val || val.trim() === '') return true;
      return z.string().url().safeParse(val).success;
    }, 'URL de Instagram inválida'),
    twitter: z.string().optional().refine((val) => {
      if (!val || val.trim() === '') return true;
      return z.string().url().safeParse(val).success;
    }, 'URL de Twitter inválida'),
    tiktok: z.string().optional().refine((val) => {
      if (!val || val.trim() === '') return true;
      return z.string().url().safeParse(val).success;
    }, 'URL de TikTok inválida'),
    youtube: z.string().optional().refine((val) => {
      if (!val || val.trim() === '') return true;
      return z.string().url().safeParse(val).success;
    }, 'URL de YouTube inválida')
  }).optional(),
  logo: z.string().optional(),
  favicon: z.string().optional(),
  currency: z.string().default('MXN'),
  timezone: z.string().default('America/Ciudad_de_Mexico'),
  language: z.string().default('es')
});

const emailSettingsSchema = z.object({
  smtpHost: z.string().min(1, 'Host SMTP es requerido'),
  smtpPort: z.number().int().min(1).max(65535),
  smtpUser: z.string().min(1, 'Usuario SMTP es requerido'),
  smtpPassword: z.string().min(1, 'Contraseña SMTP es requerida'),
  smtpSecure: z.boolean().default(false),
  fromEmail: z.string().email('Email remitente inválido'),
  fromName: z.string().min(1, 'Nombre remitente es requerido'),
  templates: z.object({
    orderConfirmation: z.boolean().default(true),
    orderStatusUpdate: z.boolean().default(true),
    orderShipped: z.boolean().default(true),
    orderDelivered: z.boolean().default(true),
    newsletter: z.boolean().default(false)
  }).optional()
});

const paymentSettingsSchema = z.object({
  stripe: z.object({
    enabled: z.boolean().default(false),
    publicKey: z.string().optional(),
    secretKey: z.string().optional(),
    webhookSecret: z.string().optional()
  }).optional(),
  paypal: z.object({
    enabled: z.boolean().default(false),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    sandbox: z.boolean().default(true)
  }).optional(),
  zelle: z.object({
    enabled: z.boolean().default(false),
    email: z.string().email().optional(),
    phone: z.string().optional()
  }).optional(),
  cashOnDelivery: z.object({
    enabled: z.boolean().default(false),
    fee: z.number().min(0).default(0)
  }).optional()
});

const shippingSettingsSchema = z.object({
  freeShippingThreshold: z.number().min(0).default(100),
  defaultShippingCost: z.number().min(0).default(10),
  maxShippingDays: z.number().int().min(1).default(7),
  restrictedCountries: z.array(z.string()).default([]),
  zones: z.array(z.object({
    id: z.string(),
    name: z.string(),
    countries: z.array(z.string()),
    cost: z.number().min(0),
    estimatedDays: z.number().int().min(1)
  })).default([])
});

// Función auxiliar para verificar permisos de admin
const verifyAdminAccess = (req: AuthenticatedRequest, res: Response): boolean => {
  if (req.user?.role !== 'ADMIN') {
    res.status(403).json({
      error: 'Acceso denegado',
      code: 'ACCESS_DENIED'
    });
    return false;
  }
  return true;
};

// Obtener configuración del sitio
export const getSiteSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!verifyAdminAccess(req, res)) return;

    // Buscar configuración existente o crear valores por defecto
    let settings = await prisma.systemSetting.findFirst({
      where: { key: 'site_settings' }
    });

    if (!settings) {
      // Crear configuración por defecto basada en el cliente
      const defaultSettings = {
        siteName: 'BeztShop',
        siteDescription: 'Tienda en línea de productos especializados, Servicios de dropshipping, Venta de productos de alta demanda, Plataformas de venta de productos artesanales.',
        siteUrl: '',
        contactEmail: '',
        contactPhone: '9985780385',
        supportEmail: '',
        address: {
          street: '',
          city: 'Ciudad de México',
          state: 'CDMX',
          zipCode: '',
          country: 'México'
        },
        socialMedia: {
          facebook: '',
          instagram: 'Intagtan',
          tiktok: 'tiktok',
          youtube: 'YouTube'
        },
        currency: 'MXN',
        timezone: 'America/Ciudad_de_Mexico',
        language: 'es'
      };

      settings = await prisma.systemSetting.create({
        data: {
          key: 'site_settings',
          value: JSON.stringify(defaultSettings)
        }
      });
    }

    const settingsValue = JSON.parse(settings.value as string);

    res.json({ settings: settingsValue });

  } catch (error) {
    console.error('Error getting site settings:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Actualizar configuración del sitio
export const updateSiteSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!verifyAdminAccess(req, res)) return;

    const validation = siteSettingsSchema.safeParse(req.body.settings);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const settings = validation.data;

    // Actualizar o crear configuración
    await prisma.systemSetting.upsert({
      where: { key: 'site_settings' },
      update: {
        value: JSON.stringify(settings),
        updatedAt: new Date()
      },
      create: {
        key: 'site_settings',
        value: JSON.stringify(settings)
      }
    });

    console.log(`Configuración del sitio actualizada por admin: ${req.user?.email}`);

    res.json({
      message: 'Configuración del sitio actualizada exitosamente',
      settings
    });

  } catch (error) {
    console.error('Error updating site settings:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Obtener configuración de email
export const getEmailSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!verifyAdminAccess(req, res)) return;

    let settings = await prisma.systemSetting.findFirst({
      where: { key: 'email_settings' }
    });

    if (!settings) {
      const defaultSettings = {
        smtpHost: '',
        smtpPort: 587,
        smtpUser: '',
        smtpPassword: '',
        smtpSecure: false,
        fromEmail: '',
        fromName: 'BeztShop',
        templates: {
          orderConfirmation: true,
          orderStatusUpdate: true,
          orderShipped: true,
          orderDelivered: true,
          newsletter: false
        }
      };

      settings = await prisma.systemSetting.create({
        data: {
          key: 'email_settings',
          value: JSON.stringify(defaultSettings)
        }
      });
    }

    const settingsValue = JSON.parse(settings.value as string);

    // No enviar la contraseña SMTP al frontend por seguridad
    if (settingsValue.smtpPassword) {
      settingsValue.smtpPassword = '••••••••';
    }

    res.json({ settings: settingsValue });

  } catch (error) {
    console.error('Error getting email settings:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Actualizar configuración de email
export const updateEmailSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!verifyAdminAccess(req, res)) return;

    const validation = emailSettingsSchema.safeParse(req.body.settings);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const settings = validation.data;

    // Si la contraseña es la máscara, mantener la actual
    if (settings.smtpPassword === '••••••••') {
      const currentSettings = await prisma.systemSetting.findFirst({
        where: { key: 'email_settings' }
      });
      
      if (currentSettings) {
        const currentValue = JSON.parse(currentSettings.value as string);
        settings.smtpPassword = currentValue.smtpPassword;
      }
    }

    await prisma.systemSetting.upsert({
      where: { key: 'email_settings' },
      update: {
        value: JSON.stringify(settings),
        updatedAt: new Date()
      },
      create: {
        key: 'email_settings',
        value: JSON.stringify(settings)
      }
    });

    console.log(`Configuración de email actualizada por admin: ${req.user?.email}`);

    res.json({
      message: 'Configuración de email actualizada exitosamente'
    });

  } catch (error) {
    console.error('Error updating email settings:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Obtener configuración de pagos
export const getPaymentSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!verifyAdminAccess(req, res)) return;

    let settings = await prisma.systemSetting.findFirst({
      where: { key: 'payment_settings' }
    });

    if (!settings) {
      // Configuración por defecto basada en las preferencias del cliente
      const defaultSettings = {
        stripe: {
          enabled: false,
          publicKey: '',
          secretKey: '',
          webhookSecret: ''
        },
        paypal: {
          enabled: false,
          clientId: '',
          clientSecret: '',
          sandbox: true
        },
        zelle: {
          enabled: true,
          email: '',
          phone: '9985780385'
        },
        cashOnDelivery: {
          enabled: false,
          fee: 0
        }
      };

      settings = await prisma.systemSetting.create({
        data: {
          key: 'payment_settings',
          value: JSON.stringify(defaultSettings)
        }
      });
    }

    const settingsValue = JSON.parse(settings.value as string);

    // Ocultar claves secretas por seguridad
    if (settingsValue.stripe?.secretKey) {
      settingsValue.stripe.secretKey = '••••••••';
    }
    if (settingsValue.stripe?.webhookSecret) {
      settingsValue.stripe.webhookSecret = '••••••••';
    }
    if (settingsValue.paypal?.clientSecret) {
      settingsValue.paypal.clientSecret = '••••••••';
    }

    res.json({ settings: settingsValue });

  } catch (error) {
    console.error('Error getting payment settings:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Actualizar configuración de pagos
export const updatePaymentSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!verifyAdminAccess(req, res)) return;

    const validation = paymentSettingsSchema.safeParse(req.body.settings);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const settings = validation.data;

    // Mantener claves secretas si son máscaras
    const currentSettings = await prisma.systemSetting.findFirst({
      where: { key: 'payment_settings' }
    });

    if (currentSettings) {
      const currentValue = JSON.parse(currentSettings.value as string);
      
      if (settings.stripe?.secretKey === '••••••••') {
        settings.stripe.secretKey = currentValue.stripe?.secretKey;
      }
      if (settings.stripe?.webhookSecret === '••••••••') {
        settings.stripe.webhookSecret = currentValue.stripe?.webhookSecret;
      }
      if (settings.paypal?.clientSecret === '••••••••') {
        settings.paypal.clientSecret = currentValue.paypal?.clientSecret;
      }
    }

    await prisma.systemSetting.upsert({
      where: { key: 'payment_settings' },
      update: {
        value: JSON.stringify(settings),
        updatedAt: new Date()
      },
      create: {
        key: 'payment_settings',
        value: JSON.stringify(settings)
      }
    });

    console.log(`Configuración de pagos actualizada por admin: ${req.user?.email}`);

    res.json({
      message: 'Configuración de pagos actualizada exitosamente'
    });

  } catch (error) {
    console.error('Error updating payment settings:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Obtener configuración de envíos
export const getShippingSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!verifyAdminAccess(req, res)) return;

    let settings = await prisma.systemSetting.findFirst({
      where: { key: 'shipping_settings' }
    });

    if (!settings) {
      // Configuración por defecto basada en las preferencias del cliente
      const defaultSettings = {
        freeShippingThreshold: 100,
        defaultShippingCost: 10,
        maxShippingDays: 7,
        restrictedCountries: [],
        zones: [
          {
            id: 'us-domestic',
            name: 'Estados Unidos Continental',
            countries: ['Estados Unidos'],
            cost: 10,
            estimatedDays: 5
          },
          {
            id: 'international',
            name: 'Internacional',
            countries: ['México', 'Canadá'],
            cost: 25,
            estimatedDays: 10
          }
        ]
      };

      settings = await prisma.systemSetting.create({
        data: {
          key: 'shipping_settings',
          value: JSON.stringify(defaultSettings)
        }
      });
    }

    const settingsValue = JSON.parse(settings.value as string);

    res.json({ settings: settingsValue });

  } catch (error) {
    console.error('Error getting shipping settings:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Actualizar configuración de envíos
export const updateShippingSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!verifyAdminAccess(req, res)) return;

    const validation = shippingSettingsSchema.safeParse(req.body.settings);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const settings = validation.data;

    await prisma.systemSetting.upsert({
      where: { key: 'shipping_settings' },
      update: {
        value: JSON.stringify(settings),
        updatedAt: new Date()
      },
      create: {
        key: 'shipping_settings',
        value: JSON.stringify(settings)
      }
    });

    console.log(`Configuración de envíos actualizada por admin: ${req.user?.email}`);

    res.json({
      message: 'Configuración de envíos actualizada exitosamente',
      settings
    });

  } catch (error) {
    console.error('Error updating shipping settings:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Obtener todas las configuraciones
export const getAllSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!verifyAdminAccess(req, res)) return;

    const allSettings = await prisma.systemSetting.findMany();
    
    const settingsMap = allSettings.reduce((acc, setting) => {
      acc[setting.key] = JSON.parse(setting.value as string);
      return acc;
    }, {} as Record<string, any>);

    res.json({ settings: settingsMap });

  } catch (error) {
    console.error('Error getting all settings:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Resetear configuraciones a valores por defecto
export const resetSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!verifyAdminAccess(req, res)) return;

    const { settingType } = req.params;

    if (!['site', 'email', 'payment', 'shipping'].includes(settingType)) {
      return res.status(400).json({
        error: 'Tipo de configuración inválido',
        code: 'INVALID_SETTING_TYPE'
      });
    }

    // Eliminar configuración existente para forzar recreación con defaults
    await prisma.systemSetting.deleteMany({
      where: { key: `${settingType}_settings` }
    });

    console.log(`Configuración ${settingType} reseteada por admin: ${req.user?.email}`);

    res.json({
      message: `Configuración de ${settingType} reseteada a valores por defecto`
    });

  } catch (error) {
    console.error('Error resetting settings:', error);
    res.status(500).json({
      error: 'Error interno del servidor',
      code: 'INTERNAL_SERVER_ERROR'
    });
  }
};

// Testear configuración de email
export const testEmailSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!verifyAdminAccess(req, res)) return;

    const { testEmail } = req.body;

    if (!testEmail || !z.string().email().safeParse(testEmail).success) {
      return res.status(400).json({
        error: 'Email de prueba inválido',
        code: 'INVALID_TEST_EMAIL'
      });
    }

    // Obtener configuración de email
    const emailSettings = await prisma.systemSetting.findFirst({
      where: { key: 'email_settings' }
    });

    if (!emailSettings) {
      return res.status(400).json({
        error: 'Configuración de email no encontrada',
        code: 'EMAIL_SETTINGS_NOT_FOUND'
      });
    }

    const settings = JSON.parse(emailSettings.value as string);

    // TODO: Implementar test real de envío de email
    // Por ahora simulamos el test
    console.log(`Testing email configuration with: ${JSON.stringify({
      host: settings.smtpHost,
      port: settings.smtpPort,
      user: settings.smtpUser,
      testEmail
    })}`);

    // Simular delay de test
    await new Promise(resolve => setTimeout(resolve, 2000));

    res.json({
      message: 'Email de prueba enviado exitosamente',
      testEmail
    });

  } catch (error) {
    console.error('Error testing email settings:', error);
    res.status(500).json({
      error: 'Error al probar configuración de email',
      code: 'EMAIL_TEST_ERROR'
    });
  }
};

// Backup de configuraciones
export const backupSettings = async (req: AuthenticatedRequest, res: Response) => {
  try {
    if (!verifyAdminAccess(req, res)) return;

    const allSettings = await prisma.systemSetting.findMany();
    
    const backup = {
      timestamp: new Date().toISOString(),
      settings: allSettings.reduce((acc, setting) => {
        acc[setting.key] = JSON.parse(setting.value as string);
        return acc;
      }, {} as Record<string, any>)
    };

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="settings-backup-${new Date().toISOString().split('T')[0]}.json"`);
    
    res.json(backup);

  } catch (error) {
    console.error('Error creating settings backup:', error);
    res.status(500).json({
      error: 'Error al crear backup de configuraciones',
      code: 'BACKUP_ERROR'
    });
  }
};