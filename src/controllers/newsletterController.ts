// src/controllers/newsletterController.ts
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { emailService } from '../services/emailService';
import { newsletterTemplate } from '../templates/emailTemplates';

const prisma = new PrismaClient();

// Schemas de validación
const subscribeSchema = z.object({
  email: z.string().email('Email inválido'),
  name: z.string().optional(),
  tags: z.string().optional()
});

const campaignSchema = z.object({
  subject: z.string().min(1, 'Asunto requerido').max(200),
  previewText: z.string().max(200).optional(),
  content: z.string().min(1, 'Contenido requerido'),
  tags: z.string().optional(),
  scheduledFor: z.string().optional(),
  sendNow: z.boolean().default(false),
  includeGuests: z.boolean().default(true), // Incluir suscriptores guest
  includeUsers: z.boolean().default(true)   // Incluir usuarios registrados
});

// === ENDPOINTS PÚBLICOS ===

// Suscribirse al newsletter
export const subscribe = async (req: Request, res: Response) => {
  try {
    const validation = subscribeSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const { email, name, tags } = validation.data;

    // Primero verificar si es un usuario registrado
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { 
        id: true, 
        firstName: true, 
        newsletterSubscribed: true 
      }
    });

    if (existingUser) {
      // Es un usuario registrado
      if (existingUser.newsletterSubscribed) {
        return res.json({
          message: 'Ya estás suscrito a nuestro newsletter',
          alreadySubscribed: true
        });
      }

      // Actualizar usuario para suscribirlo
      await prisma.user.update({
        where: { id: existingUser.id },
        data: {
          newsletterSubscribed: true,
          newsletterSubscribedAt: new Date(),
          newsletterUnsubscribedAt: null,
          newsletterTags: tags
        }
      });

      // Enviar email de bienvenida
      await emailService.sendEmail({
        to: email,
        subject: '¡Bienvenido a BeztShop Newsletter!',
        html: newsletterTemplate.welcome({
          name: existingUser.firstName || 'Suscriptor',
          discountCode: 'BIENVENIDA15'
        })
      });

      return res.status(200).json({
        message: 'Suscripción exitosa. Revisa tu email para tu cupón de bienvenida.',
        userSubscribed: true
      });
    }

    // No es usuario registrado, verificar si ya existe como guest
    const existingGuest = await prisma.newsletterGuestSubscriber.findUnique({
      where: { email }
    });

    if (existingGuest) {
      if (existingGuest.isActive) {
        return res.json({
          message: 'Ya estás suscrito a nuestro newsletter',
          alreadySubscribed: true
        });
      }

      // Reactivar suscripción guest
      await prisma.newsletterGuestSubscriber.update({
        where: { id: existingGuest.id },
        data: {
          isActive: true,
          unsubscribedAt: null,
          name: name || existingGuest.name,
          tags
        }
      });

      await emailService.sendEmail({
        to: email,
        subject: '¡Bienvenido de vuelta a BeztShop Newsletter!',
        html: newsletterTemplate.welcome({
          name: name || 'Suscriptor',
          isReactivation: true
        })
      });

      return res.json({
        message: 'Suscripción reactivada exitosamente',
        reactivated: true
      });
    }

    // Crear nuevo suscriptor guest
    const subscriber = await prisma.newsletterGuestSubscriber.create({
      data: { email, name, tags }
    });

    // Enviar email de bienvenida
    await emailService.sendEmail({
      to: email,
      subject: '¡Bienvenido a BeztShop Newsletter!',
      html: newsletterTemplate.welcome({
        name: name || 'Suscriptor',
        discountCode: 'BIENVENIDA15'
      })
    });

    res.status(201).json({
      message: 'Suscripción exitosa. Revisa tu email para tu cupón de bienvenida.',
      guestSubscribed: true
    });

  } catch (error) {
    console.error('Error en suscripción:', error);
    res.status(500).json({
      error: 'Error al procesar suscripción',
      code: 'SUBSCRIPTION_ERROR'
    });
  }
};

// Desuscribirse
export const unsubscribe = async (req: Request, res: Response) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email requerido' });
    }

    // Verificar si es usuario
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, newsletterSubscribed: true }
    });

    if (user) {
      if (!user.newsletterSubscribed) {
        return res.json({ message: 'Ya estás desuscrito' });
      }

      await prisma.user.update({
        where: { id: user.id },
        data: {
          newsletterSubscribed: false,
          newsletterUnsubscribedAt: new Date()
        }
      });

      return res.json({
        message: 'Te has desuscrito exitosamente'
      });
    }

    // Verificar si es guest subscriber
    const guest = await prisma.newsletterGuestSubscriber.findUnique({
      where: { email }
    });

    if (guest) {
      if (!guest.isActive) {
        return res.json({ message: 'Ya estás desuscrito' });
      }

      await prisma.newsletterGuestSubscriber.update({
        where: { id: guest.id },
        data: {
          isActive: false,
          unsubscribedAt: new Date()
        }
      });

      return res.json({
        message: 'Te has desuscrito exitosamente'
      });
    }

    return res.status(404).json({
      error: 'Email no encontrado en suscriptores'
    });

  } catch (error) {
    console.error('Error al desuscribir:', error);
    res.status(500).json({
      error: 'Error al procesar desuscripción'
    });
  }
};

// === ENDPOINTS DE ADMIN ===

// Obtener todos los suscriptores
export const getSubscribers = async (req: any, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const { 
      page = 1, 
      limit = 50,
      isActive,
      search 
    } = req.query;

    // Obtener usuarios suscritos
    const usersWhere: any = { newsletterSubscribed: true };
    if (search) {
      usersWhere.OR = [
        { email: { contains: search } },
        { firstName: { contains: search } },
        { lastName: { contains: search } }
      ];
    }

    const users = await prisma.user.findMany({
      where: usersWhere,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        userLevel: true,
        newsletterSubscribed: true,
        newsletterSubscribedAt: true,
        newsletterTags: true
      }
    });

    // Obtener suscriptores guest
    const guestsWhere: any = {};
    if (isActive !== undefined) {
      guestsWhere.isActive = isActive === 'true';
    }
    if (search) {
      guestsWhere.OR = [
        { email: { contains: search } },
        { name: { contains: search } }
      ];
    }

    const guests = await prisma.newsletterGuestSubscriber.findMany({
      where: guestsWhere
    });

    // Combinar resultados
    const allSubscribers = [
      ...users.map(u => ({
        id: u.id,
        email: u.email,
        name: `${u.firstName} ${u.lastName}`,
        isActive: u.newsletterSubscribed,
        subscribedAt: u.newsletterSubscribedAt,
        tags: u.newsletterTags,
        isUser: true,
        userLevel: u.userLevel
      })),
      ...guests.map(g => ({
        id: g.id,
        email: g.email,
        name: g.name,
        isActive: g.isActive,
        subscribedAt: g.subscribedAt,
        tags: g.tags,
        isUser: false,
        userLevel: null
      }))
    ];

    const startIndex = (Number(page) - 1) * Number(limit);
    const endIndex = startIndex + Number(limit);
    const paginatedSubscribers = allSubscribers.slice(startIndex, endIndex);

    res.json({
      subscribers: paginatedSubscribers,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total: allSubscribers.length,
        pages: Math.ceil(allSubscribers.length / Number(limit))
      },
      stats: {
        totalUsers: users.length,
        totalGuests: guests.length,
        activeGuests: guests.filter(g => g.isActive).length
      }
    });

  } catch (error) {
    console.error('Error obteniendo suscriptores:', error);
    res.status(500).json({ error: 'Error al obtener suscriptores' });
  }
};

// Crear y enviar campaña
export const createCampaign = async (req: any, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const validation = campaignSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const { 
      subject, 
      previewText, 
      content, 
      tags, 
      scheduledFor, 
      sendNow,
      includeUsers,
      includeGuests 
    } = validation.data;

    // Crear campaña
    const campaign = await prisma.newsletterCampaign.create({
      data: {
        subject,
        previewText,
        content,
        tags,
        status: sendNow ? 'SENDING' : scheduledFor ? 'SCHEDULED' : 'DRAFT',
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
        createdBy: req.user.id
      }
    });

    if (sendNow) {
      // Procesar envío en background
      processCampaign(campaign.id, includeUsers, includeGuests).catch(console.error);
      
      res.json({
        message: 'Campaña creada y enviándose',
        campaign
      });
    } else {
      res.json({
        message: scheduledFor ? 'Campaña programada' : 'Campaña guardada como borrador',
        campaign
      });
    }

  } catch (error) {
    console.error('Error creando campaña:', error);
    res.status(500).json({ error: 'Error al crear campaña' });
  }
};

// Función para procesar envío
async function processCampaign(
  campaignId: string, 
  includeUsers: boolean = true, 
  includeGuests: boolean = true
) {
  try {
    console.log(`📧 Iniciando envío de campaña ${campaignId}`);

    const campaign = await prisma.newsletterCampaign.findUnique({
      where: { id: campaignId }
    });

    if (!campaign) throw new Error('Campaña no encontrada');

    const recipients: Array<{
      email: string;
      name: string;
      userId?: string;
      guestId?: string;
    }> = [];

    // Obtener usuarios suscritos
    if (includeUsers) {
      const whereUsers: any = { newsletterSubscribed: true };
      
      // Filtrar por tags si hay
      if (campaign.tags) {
        const campaignTags = campaign.tags.split(',').map(t => t.trim());
        whereUsers.OR = campaignTags.map(tag => ({
          newsletterTags: { contains: tag }
        }));
      }

      const users = await prisma.user.findMany({
        where: whereUsers,
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true
        }
      });

      recipients.push(...users.map(u => ({
        email: u.email,
        name: `${u.firstName} ${u.lastName}`,
        userId: u.id
      })));
    }

    // Obtener suscriptores guest
    if (includeGuests) {
      const whereGuests: any = { isActive: true };
      
      if (campaign.tags) {
        const campaignTags = campaign.tags.split(',').map(t => t.trim());
        whereGuests.OR = campaignTags.map(tag => ({
          tags: { contains: tag }
        }));
      }

      const guests = await prisma.newsletterGuestSubscriber.findMany({
        where: whereGuests
      });

      recipients.push(...guests.map(g => ({
        email: g.email,
        name: g.name || 'Suscriptor',
        guestId: g.id
      })));
    }

    // Eliminar duplicados por email
    const uniqueRecipients = Array.from(
      new Map(recipients.map(r => [r.email, r])).values()
    );

    console.log(`📧 Enviando a ${uniqueRecipients.length} destinatarios`);

    let sentCount = 0;
    const batchSize = 10;

    for (let i = 0; i < uniqueRecipients.length; i += batchSize) {
      const batch = uniqueRecipients.slice(i, i + batchSize);
      
      await Promise.all(batch.map(async (recipient) => {
        try {
          // Verificar si ya se envió
          const existing = await prisma.newsletterCampaignSent.findUnique({
            where: {
              campaignId_email: {
                campaignId,
                email: recipient.email
              }
            }
          });

          if (existing) return;

          // Personalizar y enviar
          const personalizedHtml = newsletterTemplate.campaign({
            subject: campaign.subject,
            previewText: campaign.previewText || '',
            content: campaign.content,
            subscriberName: recipient.name,
            subscriberEmail: recipient.email,
            unsubscribeUrl: `${process.env.FRONTEND_URL}/newsletter/unsubscribe?email=${recipient.email}`
          });

          await emailService.sendEmail({
            to: recipient.email,
            subject: campaign.subject,
            html: personalizedHtml,
            from: `${campaign.fromName} <${campaign.fromEmail}>`
          });

          // Registrar envío
          await prisma.newsletterCampaignSent.create({
            data: {
              campaignId,
              userId: recipient.userId || null,
              guestSubscriberId: recipient.guestId || null,
              email: recipient.email
            }
          });

          sentCount++;
          console.log(`✅ Enviado a ${recipient.email} (${sentCount}/${uniqueRecipients.length})`);

        } catch (error) {
          console.error(`❌ Error enviando a ${recipient.email}:`, error);
        }
      }));

      if (i + batchSize < uniqueRecipients.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Actualizar campaña
    await prisma.newsletterCampaign.update({
      where: { id: campaignId },
      data: {
        status: 'SENT',
        sentAt: new Date(),
        sentCount
      }
    });

    console.log(`✅ Campaña ${campaignId} enviada a ${sentCount} destinatarios`);

  } catch (error) {
    console.error('Error procesando campaña:', error);
    
    await prisma.newsletterCampaign.update({
      where: { id: campaignId },
      data: { status: 'CANCELLED' }
    });
  }
}

// Obtener campañas
export const getCampaigns = async (req: any, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const campaigns = await prisma.newsletterCampaign.findMany({
      include: {
        admin: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        },
        _count: {
          select: { recipients: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json({ campaigns });

  } catch (error) {
    console.error('Error obteniendo campañas:', error);
    res.status(500).json({ error: 'Error al obtener campañas' });
  }
};

// Enviar campaña existente
export const sendCampaign = async (req: any, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const { id } = req.params;
    const { includeUsers = true, includeGuests = true } = req.body;

    const campaign = await prisma.newsletterCampaign.findUnique({
      where: { id }
    });

    if (!campaign) {
      return res.status(404).json({ error: 'Campaña no encontrada' });
    }

    if (campaign.status === 'SENT') {
      return res.status(400).json({ error: 'Esta campaña ya fue enviada' });
    }

    await prisma.newsletterCampaign.update({
      where: { id },
      data: { status: 'SENDING' }
    });

    processCampaign(id, includeUsers, includeGuests).catch(console.error);

    res.json({
      message: 'Campaña en proceso de envío',
      campaign
    });

  } catch (error) {
    console.error('Error enviando campaña:', error);
    res.status(500).json({ error: 'Error al enviar campaña' });
  }
};

// Estadísticas
export const getNewsletterStats = async (req: any, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      subscribedUsers,
      totalGuests,
      activeGuests,
      totalCampaigns,
      sentCampaigns,
      recentUserSubscribers,
      recentGuestSubscribers
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { newsletterSubscribed: true } }),
      prisma.newsletterGuestSubscriber.count(),
      prisma.newsletterGuestSubscriber.count({ where: { isActive: true } }),
      prisma.newsletterCampaign.count(),
      prisma.newsletterCampaign.count({ where: { status: 'SENT' } }),
      prisma.user.count({
        where: {
          newsletterSubscribed: true,
          newsletterSubscribedAt: { gte: thirtyDaysAgo }
        }
      }),
      prisma.newsletterGuestSubscriber.count({
        where: {
          isActive: true,
          subscribedAt: { gte: thirtyDaysAgo }
        }
      })
    ]);

    const totalSubscribers = subscribedUsers + activeGuests;
    const recentSubscribers = recentUserSubscribers + recentGuestSubscribers;

    res.json({
      stats: {
        totalSubscribers,
        activeSubscribers: totalSubscribers,
        subscribedUsers,
        activeGuests,
        totalUsers,
        totalGuests,
        inactiveSubscribers: (totalUsers - subscribedUsers) + (totalGuests - activeGuests),
        totalCampaigns,
        sentCampaigns,
        draftCampaigns: totalCampaigns - sentCampaigns,
        recentSubscribers,
        growthRate: totalSubscribers > 0 
          ? ((recentSubscribers / totalSubscribers) * 100).toFixed(1) 
          : 0
      }
    });

  } catch (error) {
    console.error('Error obteniendo estadísticas:', error);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
};

// Preview de campaña
export const previewCampaign = async (req: any, res: Response) => {
  try {
    if (req.user?.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Acceso denegado' });
    }

    const { subject, previewText, content } = req.body;

    const previewHtml = newsletterTemplate.campaign({
      subject,
      previewText: previewText || '',
      content,
      subscriberName: 'Juan Pérez',
      subscriberEmail: 'ejemplo@email.com',
      unsubscribeUrl: '#'
    });

    res.json({ preview: previewHtml });

  } catch (error) {
    console.error('Error generando preview:', error);
    res.status(500).json({ error: 'Error al generar preview' });
  }
};