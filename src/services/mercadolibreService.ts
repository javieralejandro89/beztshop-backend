// src/services/mercadolibreService.ts
import axios from 'axios';
import { prisma } from '../app';

const ML_AUTH_URL = 'https://auth.mercadolibre.com.mx/authorization';
const ML_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token';
const ML_API_URL = 'https://api.mercadolibre.com';

interface MercadoLibreTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  user_id: number;
}

class MercadoLibreService {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;

  constructor() {
    this.clientId = process.env.ML_CLIENT_ID || '';
    this.clientSecret = process.env.ML_CLIENT_SECRET || '';
    this.redirectUri = process.env.ML_REDIRECT_URI || '';
  }

  // 1. Generar URL de autorización
  getAuthUrl(): string {
    return `${ML_AUTH_URL}?response_type=code&client_id=${this.clientId}&redirect_uri=${encodeURIComponent(this.redirectUri)}`;
  }

  // 2. Obtener tokens con código de autorización
  async getTokensFromCode(code: string): Promise<MercadoLibreTokens> {
    try {
      const response = await axios.post(ML_TOKEN_URL, null, {
        params: {
          grant_type: 'authorization_code',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          code,
          redirect_uri: this.redirectUri,
        },
      });

      return response.data;
    } catch (error: any) {
      console.error('Error getting ML tokens:', error.response?.data || error.message);
      throw new Error('Error al obtener tokens de Mercado Libre');
    }
  }

  // 3. Refrescar token de acceso
  async refreshAccessToken(refreshToken: string): Promise<MercadoLibreTokens> {
    try {
      const response = await axios.post(ML_TOKEN_URL, null, {
        params: {
          grant_type: 'refresh_token',
          client_id: this.clientId,
          client_secret: this.clientSecret,
          refresh_token: refreshToken,
        },
      });

      return response.data;
    } catch (error: any) {
      console.error('Error refreshing ML token:', error.response?.data || error.message);
      throw new Error('Error al refrescar token de Mercado Libre');
    }
  }

  // 4. Obtener token válido desde BD
  async getValidAccessToken(): Promise<string> {
    const mlAuth = await prisma.mercadoLibreAuth.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    if (!mlAuth) {
      throw new Error('No hay autorización de Mercado Libre configurada');
    }

    // Verificar si el token está por expirar (renovar si quedan menos de 10 minutos)
    const expiresAt = new Date(mlAuth.expiresAt);
    const now = new Date();
    const minutesUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60);

    if (minutesUntilExpiry < 10) {
      console.log('🔄 Token de ML próximo a expirar, renovando...');
      const newTokens = await this.refreshAccessToken(mlAuth.refreshToken);
      
      // Actualizar en BD
      await prisma.mercadoLibreAuth.update({
        where: { id: mlAuth.id },
        data: {
          accessToken: newTokens.access_token,
          refreshToken: newTokens.refresh_token,
          expiresAt: new Date(Date.now() + newTokens.expires_in * 1000),
        },
      });

      return newTokens.access_token;
    }

    return mlAuth.accessToken;
  }

  // 5. Publicar producto en Mercado Libre
  async publishProduct(productId: string, siteId: string = 'MLM') {
    try {
      const accessToken = await this.getValidAccessToken();

      // Obtener producto de la BD
      const product = await prisma.product.findUnique({
        where: { id: productId },
        include: { category: true },
      });

      if (!product) {
        throw new Error('Producto no encontrado');
      }

      // Mapear categoría (esto es simplificado, idealmente deberías tener un mapeo de categorías)
      const mlCategoryId = await this.suggestCategory(product.name, siteId, accessToken);

      // Preparar imágenes
      const images = Array.isArray(product.images) 
        ? product.images.map((img: any) => ({ source: img.url }))
        : [];

      // Preparar body para ML
      const itemData = {
        title: product.name.substring(0, 60), // ML tiene límite de 60 caracteres
        category_id: mlCategoryId,
        price: Number(product.price),
        currency_id: 'MXN', // Cambiar según tu país
        available_quantity: product.stockCount,
        buying_mode: 'buy_it_now',
        condition: 'new',
        listing_type_id: 'gold_special', // Tipo de publicación
        description: {
          plain_text: product.description.substring(0, 50000), // Límite de ML
        },
        pictures: images,
        shipping: {
          mode: 'me2',
          local_pick_up: false,
          free_shipping: false,
        },
      };

      // Publicar en ML
      const response = await axios.post(
        `${ML_API_URL}/items`,
        itemData,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const mlItem = response.data;

      // Guardar relación en BD
      await prisma.mercadoLibreProduct.create({
        data: {
          productId: product.id,
          mlItemId: mlItem.id,
          permalink: mlItem.permalink,
          status: mlItem.status,
        },
      });

      return {
        success: true,
        mlItemId: mlItem.id,
        permalink: mlItem.permalink,
        data: mlItem,
      };
    } catch (error: any) {
      console.error('Error publishing to ML:', error.response?.data || error.message);
      throw new Error(
        error.response?.data?.message || 'Error al publicar en Mercado Libre'
      );
    }
  }

  // 6. Sugerir categoría de ML basada en el título del producto
  async suggestCategory(title: string, siteId: string, accessToken: string): Promise<string> {
    try {
      const response = await axios.get(
        `${ML_API_URL}/sites/${siteId}/category_predictor/predict`,
        {
          params: { title },
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      return response.data.id;
    } catch (error) {
      console.error('Error suggesting category:', error);
      // Retornar categoría genérica como fallback
      return siteId === 'MLM' ? 'MLM1051' : 'MLA1051'; // Celulares y Teléfonos
    }
  }

  // 7. Actualizar precio en ML
  async updatePrice(mlItemId: string, newPrice: number) {
    try {
      const accessToken = await this.getValidAccessToken();

      await axios.put(
        `${ML_API_URL}/items/${mlItemId}`,
        { price: newPrice },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return { success: true };
    } catch (error: any) {
      console.error('Error updating ML price:', error.response?.data || error.message);
      throw new Error('Error al actualizar precio en Mercado Libre');
    }
  }

  // 8. Actualizar stock en ML
  async updateStock(mlItemId: string, quantity: number) {
    try {
      const accessToken = await this.getValidAccessToken();

      await axios.put(
        `${ML_API_URL}/items/${mlItemId}`,
        { available_quantity: quantity },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      return { success: true };
    } catch (error: any) {
      console.error('Error updating ML stock:', error.response?.data || error.message);
      throw new Error('Error al actualizar stock en Mercado Libre');
    }
  }

  // 9. Pausar/Activar publicación
  async updateStatus(mlItemId: string, status: 'active' | 'paused') {
    try {
      const accessToken = await this.getValidAccessToken();

      await axios.put(
        `${ML_API_URL}/items/${mlItemId}`,
        { status },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Actualizar en BD
      await prisma.mercadoLibreProduct.updateMany({
        where: { mlItemId },
        data: { status },
      });

      return { success: true };
    } catch (error: any) {
      console.error('Error updating ML status:', error.response?.data || error.message);
      throw new Error('Error al actualizar estado en Mercado Libre');
    }
  }

  // 10. Eliminar publicación
  async deleteProduct(mlItemId: string) {
    try {
      const accessToken = await this.getValidAccessToken();

      await axios.put(
        `${ML_API_URL}/items/${mlItemId}`,
        { status: 'closed' },
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
        }
      );

      // Actualizar en BD
      await prisma.mercadoLibreProduct.updateMany({
        where: { mlItemId },
        data: { status: 'closed' },
      });

      return { success: true };
    } catch (error: any) {
      console.error('Error deleting ML product:', error.response?.data || error.message);
      throw new Error('Error al eliminar producto de Mercado Libre');
    }
  }

  // 11. Obtener información del usuario ML
  async getUserInfo(): Promise<any> {
    try {
      const accessToken = await this.getValidAccessToken();

      const response = await axios.get(`${ML_API_URL}/users/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      return response.data;
    } catch (error: any) {
      console.error('Error getting ML user info:', error.response?.data || error.message);
      throw new Error('Error al obtener información del usuario de Mercado Libre');
    }
  }
}

export default new MercadoLibreService();