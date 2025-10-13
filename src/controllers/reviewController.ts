// src/controllers/reviewController.ts - Controlador de reseñas de productos
import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';
import { emailService } from '../services/emailService';
import { newReviewNotificationTemplate } from '../templates/emailTemplates';

const prisma = new PrismaClient();

// Schema de validación
const reviewSchema = z.object({
  productId: z.string().cuid(),
  rating: z.number().int().min(1).max(5),
  title: z.string().min(1).max(100).optional(),
  comment: z.string().min(10, 'El comentario debe tener al menos 10 caracteres').max(1000).optional(),
});

// Crear reseña
export const createReview = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ 
        error: 'Debes iniciar sesión para dejar una reseña',
        code: 'NOT_AUTHENTICATED'
      });
    }

    const validation = reviewSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const { productId, rating, title, comment } = validation.data;

    // Verificar que el producto existe
    const product = await prisma.product.findUnique({
      where: { id: productId, isActive: true },
      select: { id: true, name: true }
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    // Verificar si ya dejó una reseña
    const existingReview = await prisma.productReview.findUnique({
      where: {
        productId_userId: {
          productId,
          userId
        }
      }
    });

    if (existingReview) {
      return res.status(409).json({ 
        error: 'Ya has dejado una reseña para este producto',
        code: 'REVIEW_EXISTS'
      });
    }

    // Crear reseña
    const review = await prisma.productReview.create({
      data: {
        productId,
        userId,
        rating,
        title: title || null,
        comment: comment || null,
        isVerified: false, // Admin debe aprobar
        isApproved: true // ✅ Publicación instantánea
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    // Actualizar estadísticas del producto
    await updateProductReviewStats(productId);

    console.log(`Nueva reseña creada: ${review.id} por usuario ${userId}`);

    // Enviar notificación al admin (opcional)
    try {
      await emailService.sendEmail({
        to: process.env.FROM_EMAIL || 'atencionalcliente@beztshop.com',
        subject: `Nueva reseña publicada: ${product.name}`,
        html: newReviewNotificationTemplate({
          productName: product.name,
          customerName: `${review.user.firstName} ${review.user.lastName}`,
          rating,
          comment: comment || 'Sin comentario',
          reviewId: review.id
        })
      });
    } catch (emailError) {
      console.log(`Nueva reseña publicada: ${review.id} para producto ${product.name}`);
      // No fallar la creación si falla el email
    }

    console.log(`Nueva reseña creada: ${review.id} por usuario ${userId}`);

    res.status(201).json({
      message: 'Reseña publicada exitosamente. ¡Gracias por tu opinión!',
      review: {
        id: review.id,
        rating: review.rating,
        title: review.title,
        comment: review.comment,
        isApproved: review.isApproved,
        createdAt: review.createdAt
      }
    });

  } catch (error) {
    console.error('Error creando reseña:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener reseñas de un producto
export const getProductReviews = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { productId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10;
    const skip = (page - 1) * limit;

    // Obtener reseñas aprobadas
    const [reviews, total, stats] = await Promise.all([
      prisma.productReview.findMany({
        where: {
          productId,
          isApproved: true
        },
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      
      prisma.productReview.count({
        where: {
          productId,
          isApproved: true
        }
      }),

      // Estadísticas de ratings
      prisma.productReview.groupBy({
        by: ['rating'],
        where: {
          productId,
          isApproved: true
        },
        _count: { rating: true }
      })
    ]);

    // Calcular distribución de ratings
    const ratingDistribution = {
      5: 0, 4: 0, 3: 0, 2: 0, 1: 0
    };

    stats.forEach(stat => {
      ratingDistribution[stat.rating as keyof typeof ratingDistribution] = stat._count.rating;
    });

    // Calcular promedio
    const totalReviews = Object.values(ratingDistribution).reduce((a, b) => a + b, 0);
    const averageRating = totalReviews > 0
      ? Object.entries(ratingDistribution).reduce((acc, [rating, count]) => {
          return acc + (parseInt(rating) * count);
        }, 0) / totalReviews
      : 0;

    res.json({
      reviews: reviews.map(review => ({
        id: review.id,
        rating: review.rating,
        title: review.title,
        comment: review.comment,
        isVerified: review.isVerified,
        createdAt: review.createdAt,
        user: {
          name: `${review.user.firstName} ${review.user.lastName}`,
          firstName: review.user.firstName
        }
      })),
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      },
      stats: {
        averageRating: Math.round(averageRating * 10) / 10,
        totalReviews,
        distribution: ratingDistribution
      }
    });

  } catch (error) {
    console.error('Error obteniendo reseñas:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Verificar si el usuario ya dejó reseña
export const checkUserReview = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const { productId } = req.params;

    if (!userId) {
      return res.json({ hasReviewed: false });
    }

    const review = await prisma.productReview.findUnique({
      where: {
        productId_userId: {
          productId,
          userId
        }
      },
      select: {
        id: true,
        rating: true,
        title: true,
        comment: true,
        isApproved: true,
        createdAt: true
      }
    });

    res.json({
      hasReviewed: !!review,
      review: review || null
    });

  } catch (error) {
    console.error('Error verificando reseña del usuario:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Función auxiliar para actualizar estadísticas del producto
const updateProductReviewStats = async (productId: string) => {
  try {
    console.log(`🔄 Actualizando stats para producto: ${productId}`);
    
    const reviews = await prisma.productReview.findMany({
      where: {
        productId,
        isApproved: true
      },
      select: { rating: true }
    });

    console.log(`📊 Reseñas aprobadas encontradas: ${reviews.length}`);
    console.log(`📊 Ratings: ${reviews.map(r => r.rating).join(', ')}`);

    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0
      ? reviews.reduce((acc, r) => acc + r.rating, 0) / totalReviews
      : 0;

    const roundedRating = Math.round(averageRating * 100) / 100;

    console.log(`📊 Rating promedio calculado: ${averageRating}`);
    console.log(`📊 Rating redondeado: ${roundedRating}`);
    console.log(`📊 Total reseñas: ${totalReviews}`);

    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: {
        rating: roundedRating,
        reviewCount: totalReviews
      },
      select: {
        id: true,
        name: true,
        rating: true,
        reviewCount: true
      }
    });

    console.log(`✅ Producto actualizado:`, {
      id: updatedProduct.id,
      name: updatedProduct.name,
      rating: updatedProduct.rating,
      reviewCount: updatedProduct.reviewCount
    });

  } catch (error) {
    console.error('❌ Error actualizando stats del producto:', error);
    throw error; // Propagar el error para que se vea en la respuesta
  }
};

// ===== ADMIN ENDPOINTS =====

// Obtener todas las reseñas (admin)
export const getAllReviewsAdmin = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const status = req.query.status as string; // 'pending', 'approved', 'all'
    const skip = (page - 1) * limit;

    let whereClause: any = {};

    if (status === 'pending') {
      whereClause.isApproved = false;
    } else if (status === 'approved') {
      whereClause.isApproved = true;
    }

    const [reviews, total] = await Promise.all([
      prisma.productReview.findMany({
        where: whereClause,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true
            }
          },
          product: {
            select: {
              id: true,
              name: true,
              slug: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      
      prisma.productReview.count({ where: whereClause })
    ]);

    res.json({
      reviews,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    console.error('Error obteniendo reseñas admin:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Aprobar/rechazar reseña (admin)
export const updateReviewStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const { isApproved } = req.body;

    const review = await prisma.productReview.update({
      where: { id },
      data: { isApproved },
      include: {
        product: {
          select: { id: true, name: true }
        }
      }
    });

    // Actualizar stats del producto si se aprobó/rechazó
    await updateProductReviewStats(review.productId);

    console.log(`Reseña ${id} ${isApproved ? 'aprobada' : 'rechazada'} por admin`);

    res.json({
      message: `Reseña ${isApproved ? 'aprobada' : 'rechazada'} exitosamente`,
      review
    });

  } catch (error) {
    console.error('Error actualizando status de reseña:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Eliminar reseña (admin)
export const deleteReview = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const review = await prisma.productReview.findUnique({
      where: { id },
      select: { productId: true }
    });

    if (!review) {
      return res.status(404).json({ error: 'Reseña no encontrada' });
    }

    await prisma.productReview.delete({
      where: { id }
    });

    // Actualizar stats del producto
    await updateProductReviewStats(review.productId);

    console.log(`Reseña ${id} eliminada por admin`);

    res.json({ message: 'Reseña eliminada exitosamente' });

  } catch (error) {
    console.error('Error eliminando reseña:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};