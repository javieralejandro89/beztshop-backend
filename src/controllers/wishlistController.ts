// src/controllers/wishlistController.ts - Controlador para wishlist/favoritos
import { Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';

const prisma = new PrismaClient();

// Schema de validación
const wishlistItemSchema = z.object({
  productId: z.string().min(1, 'ID del producto es requerido')
});

// Obtener wishlist del usuario
export const getWishlist = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        error: 'Usuario no autenticado'
      });
    }

    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 12;
    const skip = (page - 1) * limit;

    const [wishlistItems, total] = await Promise.all([
      prisma.wishlistItem.findMany({
        where: { userId },
        include: {
          product: {
            select: {
              id: true,
              name: true,
              slug: true,
              price: true,
              comparePrice: true,
              images: true,
              brand: true,
              isActive: true,
              inStock: true,
              rating: true,
              reviewCount: true
            }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit
      }),
      prisma.wishlistItem.count({
        where: { userId }
      })
    ]);

    const formattedItems = wishlistItems
      .filter(item => item.product?.isActive) // Solo productos activos
      .map(item => ({
        id: item.id,
        productId: item.productId,
        addedAt: item.createdAt,
        product: {
          ...item.product,
          price: Number(item.product!.price),
          comparePrice: item.product!.comparePrice ? Number(item.product!.comparePrice) : null,
          rating: item.product!.rating ? Number(item.product!.rating) : null,
          images: Array.isArray(item.product!.images) ? item.product!.images : []
        }
      }));

    res.json({
      items: formattedItems,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1
      }
    });

  } catch (error) {
    console.error('Error obteniendo wishlist:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Agregar producto a wishlist
export const addToWishlist = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        error: 'Usuario no autenticado'
      });
    }

    const validation = wishlistItemSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const { productId } = validation.data;

    // Verificar que el producto existe
    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: { id: true, name: true, isActive: true }
    });

    if (!product) {
      return res.status(404).json({
        error: 'Producto no encontrado'
      });
    }

    if (!product.isActive) {
      return res.status(400).json({
        error: 'No se puede agregar un producto inactivo a favoritos'
      });
    }

    // Verificar si ya está en wishlist
    const existingItem = await prisma.wishlistItem.findUnique({
      where: {
        userId_productId: {
          userId,
          productId
        }
      }
    });

    if (existingItem) {
      return res.status(409).json({
        error: 'El producto ya está en tu lista de favoritos'
      });
    }

    // Crear item en wishlist
    const wishlistItem = await prisma.wishlistItem.create({
      data: {
        userId,
        productId
      },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            images: true
          }
        }
      }
    });

    console.log(`Producto ${product.name} agregado a favoritos por usuario ${userId}`);

    res.status(201).json({
      message: 'Producto agregado a favoritos',
      item: {
        id: wishlistItem.id,
        productId: wishlistItem.productId,
        addedAt: wishlistItem.createdAt,
        product: wishlistItem.product
      }
    });

  } catch (error) {
    console.error('Error agregando a wishlist:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Eliminar producto de wishlist
export const removeFromWishlist = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const productId = req.params.productId;
    
    if (!userId) {
      return res.status(401).json({
        error: 'Usuario no autenticado'
      });
    }

    // Verificar que el item existe y pertenece al usuario
    const existingItem = await prisma.wishlistItem.findUnique({
      where: {
        userId_productId: {
          userId,
          productId
        }
      }
    });

    if (!existingItem) {
      return res.status(404).json({
        error: 'El producto no está en tu lista de favoritos'
      });
    }

    // Eliminar item
    await prisma.wishlistItem.delete({
      where: {
        userId_productId: {
          userId,
          productId
        }
      }
    });

    console.log(`Producto ${productId} eliminado de favoritos por usuario ${userId}`);

    res.json({
      message: 'Producto eliminado de favoritos'
    });

  } catch (error) {
    console.error('Error eliminando de wishlist:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Verificar si un producto está en wishlist
export const checkWishlistStatus = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    const productId = req.params.productId;
    
    if (!userId) {
      return res.status(401).json({
        error: 'Usuario no autenticado'
      });
    }

    const wishlistItem = await prisma.wishlistItem.findUnique({
      where: {
        userId_productId: {
          userId,
          productId
        }
      }
    });

    res.json({
      inWishlist: !!wishlistItem,
      wishlistItemId: wishlistItem?.id || null
    });

  } catch (error) {
    console.error('Error verificando estado de wishlist:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Limpiar wishlist
export const clearWishlist = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({
        error: 'Usuario no autenticado'
      });
    }

    const deleteResult = await prisma.wishlistItem.deleteMany({
      where: { userId }
    });

    console.log(`Wishlist limpiada para usuario ${userId} - ${deleteResult.count} items eliminados`);

    res.json({
      message: 'Lista de favoritos limpiada exitosamente',
      deletedCount: deleteResult.count
    });

  } catch (error) {
    console.error('Error limpiando wishlist:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};