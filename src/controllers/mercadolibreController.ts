// src/controllers/mercadolibreController.ts
import { Request, Response } from 'express';
import { prisma } from '../app';
import mercadolibreService from '../services/mercadolibreService';

export const mercadolibreController = {
  // 1. Obtener URL de autorización
  getAuthUrl: async (req: Request, res: Response) => {
    try {
      const authUrl = mercadolibreService.getAuthUrl();
      
      res.json({
        success: true,
        authUrl,
        message: 'Redirige al usuario a esta URL para autorizar',
      });
    } catch (error: any) {
      console.error('Error getting ML auth URL:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al generar URL de autorización',
      });
    }
  },

  // 2. Callback - Guardar tokens
  handleCallback: async (req: Request, res: Response) => {
    try {
      const { code } = req.query;

      if (!code || typeof code !== 'string') {
        return res.status(400).json({
          success: false,
          error: 'Código de autorización no proporcionado',
        });
      }

      // Obtener tokens
      const tokens = await mercadolibreService.getTokensFromCode(code);

      // Guardar en BD
      await prisma.mercadoLibreAuth.create({
        data: {
          accessToken: tokens.access_token,
          refreshToken: tokens.refresh_token,
          mlUserId: tokens.user_id.toString(),
          expiresAt: new Date(Date.now() + tokens.expires_in * 1000),
        },
      });

      // Obtener info del usuario ML
      const userInfo = await mercadolibreService.getUserInfo();

      res.json({
        success: true,
        message: 'Autorización exitosa',
        user: {
          id: userInfo.id,
          nickname: userInfo.nickname,
          email: userInfo.email,
        },
      });
    } catch (error: any) {
      console.error('Error handling ML callback:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al procesar autorización',
      });
    }
  },

  // 3. Verificar estado de autorización
  checkAuth: async (req: Request, res: Response) => {
    try {
      const mlAuth = await prisma.mercadoLibreAuth.findFirst({
        orderBy: { createdAt: 'desc' },
      });

      if (!mlAuth) {
        return res.json({
          success: true,
          isAuthorized: false,
          message: 'No hay autorización configurada',
        });
      }

      // Verificar si está expirado
      const isExpired = new Date(mlAuth.expiresAt) < new Date();

      if (isExpired) {
        return res.json({
          success: true,
          isAuthorized: false,
          message: 'La autorización ha expirado',
        });
      }

      // Obtener info del usuario
      try {
        const userInfo = await mercadolibreService.getUserInfo();
        
        res.json({
          success: true,
          isAuthorized: true,
          user: {
            id: userInfo.id,
            nickname: userInfo.nickname,
            email: userInfo.email,
          },
          expiresAt: mlAuth.expiresAt,
        });
      } catch (error) {
        res.json({
          success: true,
          isAuthorized: false,
          message: 'Token inválido, necesita reautorizar',
        });
      }
    } catch (error: any) {
      console.error('Error checking ML auth:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al verificar autorización',
      });
    }
  },

  // 4. Publicar producto
  publishProduct: async (req: Request, res: Response) => {
    try {
      const { productId, siteId } = req.body;

      if (!productId) {
        return res.status(400).json({
          success: false,
          error: 'Product ID es requerido',
        });
      }

      const result = await mercadolibreService.publishProduct(
        productId,
        siteId || 'MLM'
      );

      res.json({
        success: true,
        message: 'Producto publicado exitosamente en Mercado Libre',
        data: result,
      });
    } catch (error: any) {
      console.error('Error publishing product to ML:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al publicar producto',
      });
    }
  },

  // 5. Publicar múltiples productos
  publishMultipleProducts: async (req: Request, res: Response) => {
    try {
      const { productIds, siteId } = req.body;

      if (!Array.isArray(productIds) || productIds.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'Se requiere un array de product IDs',
        });
      }

      const results = [];
      const errors = [];

      for (const productId of productIds) {
        try {
          const result = await mercadolibreService.publishProduct(
            productId,
            siteId || 'MLM'
          );
          results.push({ productId, ...result });
        } catch (error: any) {
          errors.push({ productId, error: error.message });
        }
      }

      res.json({
        success: true,
        message: `${results.length} productos publicados, ${errors.length} errores`,
        results,
        errors,
      });
    } catch (error: any) {
      console.error('Error publishing multiple products:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al publicar productos',
      });
    }
  },

  // 6. Obtener productos publicados
  getPublishedProducts: async (req: Request, res: Response) => {
    try {
      const publishedProducts = await prisma.mercadoLibreProduct.findMany({
        include: {
          product: {
            select: {
              id: true,
              name: true,
              price: true,
              stockCount: true,
              images: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      res.json({
        success: true,
        data: publishedProducts,
        total: publishedProducts.length,
      });
    } catch (error: any) {
      console.error('Error getting published products:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al obtener productos publicados',
      });
    }
  },

  // 7. Actualizar precio
  updatePrice: async (req: Request, res: Response) => {
    try {
      const { mlItemId, price } = req.body;

      if (!mlItemId || !price) {
        return res.status(400).json({
          success: false,
          error: 'mlItemId y price son requeridos',
        });
      }

      await mercadolibreService.updatePrice(mlItemId, price);

      res.json({
        success: true,
        message: 'Precio actualizado exitosamente',
      });
    } catch (error: any) {
      console.error('Error updating price:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al actualizar precio',
      });
    }
  },

  // 8. Actualizar stock
  updateStock: async (req: Request, res: Response) => {
    try {
      const { mlItemId, quantity } = req.body;

      if (!mlItemId || quantity === undefined) {
        return res.status(400).json({
          success: false,
          error: 'mlItemId y quantity son requeridos',
        });
      }

      await mercadolibreService.updateStock(mlItemId, quantity);

      res.json({
        success: true,
        message: 'Stock actualizado exitosamente',
      });
    } catch (error: any) {
      console.error('Error updating stock:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al actualizar stock',
      });
    }
  },

  // 9. Cambiar estado (pausar/activar)
  updateStatus: async (req: Request, res: Response) => {
    try {
      const { mlItemId, status } = req.body;

      if (!mlItemId || !status) {
        return res.status(400).json({
          success: false,
          error: 'mlItemId y status son requeridos',
        });
      }

      if (!['active', 'paused'].includes(status)) {
        return res.status(400).json({
          success: false,
          error: 'Status debe ser "active" o "paused"',
        });
      }

      await mercadolibreService.updateStatus(mlItemId, status);

      res.json({
        success: true,
        message: `Producto ${status === 'active' ? 'activado' : 'pausado'} exitosamente`,
      });
    } catch (error: any) {
      console.error('Error updating status:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al actualizar estado',
      });
    }
  },

  // 10. Eliminar producto
  deleteProduct: async (req: Request, res: Response) => {
    try {
      const { mlItemId } = req.params;

      if (!mlItemId) {
        return res.status(400).json({
          success: false,
          error: 'mlItemId es requerido',
        });
      }

      await mercadolibreService.deleteProduct(mlItemId);

      res.json({
        success: true,
        message: 'Producto eliminado exitosamente de Mercado Libre',
      });
    } catch (error: any) {
      console.error('Error deleting product:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al eliminar producto',
      });
    }
  },

  // 11. Sincronizar producto (precio y stock)
  syncProduct: async (req: Request, res: Response) => {
    try {
      const { productId } = req.params;

      // Obtener producto de BD
      const product = await prisma.product.findUnique({
        where: { id: productId },
      });

      if (!product) {
        return res.status(404).json({
          success: false,
          error: 'Producto no encontrado',
        });
      }

      // Buscar relación con ML
      const mlProduct = await prisma.mercadoLibreProduct.findFirst({
        where: { productId },
      });

      if (!mlProduct) {
        return res.status(404).json({
          success: false,
          error: 'Producto no está publicado en Mercado Libre',
        });
      }

      // Sincronizar precio y stock
      await mercadolibreService.updatePrice(mlProduct.mlItemId, Number(product.price));
      await mercadolibreService.updateStock(mlProduct.mlItemId, product.stockCount);

      res.json({
        success: true,
        message: 'Producto sincronizado exitosamente',
      });
    } catch (error: any) {
      console.error('Error syncing product:', error);
      res.status(500).json({
        success: false,
        error: error.message || 'Error al sincronizar producto',
      });
    }
  },
};