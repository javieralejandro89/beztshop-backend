// src/services/mercadolibreService.ts - CORREGIDO SEGÚN API OFICIAL DE ML
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

    if (!this.clientId || !this.clientSecret) {
      console.warn('⚠️ ML credentials not configured in .env');
    }
  }

  getAuthUrl(): string {
    return `${ML_AUTH_URL}?response_type=code&client_id=${this.clientId}&redirect_uri=${encodeURIComponent(this.redirectUri)}`;
  }

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
      console.error('❌ Error getting ML tokens:', error.response?.data || error.message);
      throw new Error('Error al obtener tokens de Mercado Libre');
    }
  }

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
      console.error('❌ Error refreshing ML token:', error.response?.data || error.message);
      throw new Error('Error al refrescar token de Mercado Libre');
    }
  }

  async getValidAccessToken(): Promise<string> {
    const mlAuth = await prisma.mercadoLibreAuth.findFirst({
      orderBy: { createdAt: 'desc' },
    });

    if (!mlAuth) {
      throw new Error('No hay autorización de Mercado Libre configurada');
    }

    const expiresAt = new Date(mlAuth.expiresAt);
    const now = new Date();
    const minutesUntilExpiry = (expiresAt.getTime() - now.getTime()) / (1000 * 60);

    if (minutesUntilExpiry < 10) {
      console.log('🔄 Token de ML próximo a expirar, renovando...');
      const newTokens = await this.refreshAccessToken(mlAuth.refreshToken);
      
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

  // ✅ NUEVO: Obtener categoría LEAF válida
  async getValidLeafCategory(title: string, siteId: string, accessToken: string): Promise<string> {
    try {
      // 1. Primero intentar predecir categoría
      console.log(`🔍 Prediciendo categoría para: "${title}"`);
      
      const predictResponse = await axios.get(
        `${ML_API_URL}/sites/${siteId}/category_predictor/predict`,
        {
          params: { title },
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      const predictedCategory = predictResponse.data.id;
      console.log(`📂 Categoría predicha: ${predictedCategory}`);

      // 2. Verificar si es una categoría leaf
      const categoryDetails = await axios.get(
        `${ML_API_URL}/categories/${predictedCategory}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      );

      // Una categoría es "leaf" si children_categories está vacío
      const isLeaf = !categoryDetails.data.children_categories || 
                     categoryDetails.data.children_categories.length === 0;

      if (isLeaf) {
        console.log(`✅ Categoría ${predictedCategory} es leaf, usando esta`);
        return predictedCategory;
      }

      // 3. Si no es leaf, buscar la primera subcategoría leaf
      console.log(`⚠️ Categoría ${predictedCategory} no es leaf, buscando subcategoría...`);
      
      if (categoryDetails.data.children_categories && 
          categoryDetails.data.children_categories.length > 0) {
        
        // Tomar la primera subcategoría
        const firstChild = categoryDetails.data.children_categories[0];
        console.log(`🔄 Intentando con subcategoría: ${firstChild.id}`);
        
        // Verificar recursivamente
        const childDetails = await axios.get(
          `${ML_API_URL}/categories/${firstChild.id}`,
          {
            headers: { Authorization: `Bearer ${accessToken}` },
          }
        );

        const childIsLeaf = !childDetails.data.children_categories || 
                            childDetails.data.children_categories.length === 0;

        if (childIsLeaf) {
          console.log(`✅ Subcategoría ${firstChild.id} es leaf, usando esta`);
          return firstChild.id;
        }

        // Si tampoco es leaf, tomar la primera subcategoría de esta
        if (childDetails.data.children_categories && 
            childDetails.data.children_categories.length > 0) {
          const leafCategory = childDetails.data.children_categories[0].id;
          console.log(`✅ Usando categoría final: ${leafCategory}`);
          return leafCategory;
        }
      }

      // Fallback si no encuentra nada
      throw new Error('No se pudo encontrar una categoría leaf válida');
      
    } catch (error: any) {
      console.error('⚠️ Error en predicción de categoría:', error.message);
      
      // Fallbacks específicos por tipo de producto
      return this.getFallbackLeafCategory(title, siteId);
    }
  }

  // ✅ NUEVO: Categorías leaf de fallback
  private getFallbackLeafCategory(title: string, siteId: string): string {
    const titleLower = title.toLowerCase();
    
    console.log(`🔧 Usando categoría fallback para: "${title}"`);

    // Laptops y Computadoras
    if (titleLower.includes('macbook') || titleLower.includes('laptop')) {
      return 'MLM1652'; // Laptops y Accesorios > Laptops
    }
    
    // Smartphones específicos
    if (titleLower.includes('iphone')) {
      return 'MLM1055'; // Celulares y Smartphones > Apple iPhone
    }
    if (titleLower.includes('samsung') && (titleLower.includes('galaxy') || titleLower.includes('s24'))) {
      return 'MLM1055'; // Celulares y Smartphones > Samsung Galaxy
    }
    
    // Tablets
    if (titleLower.includes('ipad')) {
      return 'MLM1499'; // Tablets y Accesorios > Tablets
    }
    
    // Audífonos
    if (titleLower.includes('airpods') || titleLower.includes('audifonos') || titleLower.includes('auriculares')) {
      return 'MLM1435'; // Audio > Audífonos
    }
    
    // Smartwatches
    if (titleLower.includes('watch') || titleLower.includes('reloj')) {
      return 'MLM431230'; // Relojes y Joyas > Smartwatches y Accesorios
    }

    // Accesorios de celular
    if (titleLower.includes('funda') || titleLower.includes('case') || titleLower.includes('protector')) {
      return 'MLM4941'; // Accesorios para Celulares > Fundas y Estuches
    }

    // Default: Celulares genérico (muy usado)
    console.log(`⚠️ No hay fallback específico, usando categoría genérica de celulares`);
    return 'MLM1055'; // Celulares y Smartphones
  }

  // ✅ NUEVO: Obtener configuración de envío del usuario
  async getUserShippingModes(accessToken: string): Promise<string[]> {
    try {
      const userInfo = await axios.get(`${ML_API_URL}/users/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      // Verificar modos de envío disponibles
      const shippingModes = userInfo.data.shipping_modes || [];
      console.log(`📦 Modos de envío disponibles para el usuario:`, shippingModes);
      
      return shippingModes;
    } catch (error: any) {
      console.error('⚠️ Error obteniendo modos de envío:', error.message);
      return ['me2']; // Default a ME2 (Mercado Envíos Flex)
    }
  }

  // 5. Publicar producto - CORREGIDO
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

      // ✅ Validaciones previas
      if (!product.images || (Array.isArray(product.images) && product.images.length === 0)) {
        throw new Error(`El producto "${product.name}" debe tener al menos 1 imagen`);
      }

      if (!product.brand) {
        console.warn(`⚠️ El producto "${product.name}" no tiene marca, se usará valor genérico`);
      }

      console.log(`📤 Publicando producto: ${product.name}`);

      // ✅ PASO 1: Obtener categoría LEAF válida
      const mlCategoryId = await this.getValidLeafCategory(
        product.name, 
        siteId, 
        accessToken
      );

      // ✅ PASO 2: Obtener modos de envío del usuario
      const userShippingModes = await this.getUserShippingModes(accessToken);

      // Preparar imágenes
      const images = Array.isArray(product.images) 
        ? product.images
            .filter((img: any) => img && img.url)
            .slice(0, 10)
            .map((img: any) => ({ source: img.url }))
        : [];

      if (images.length === 0) {
        throw new Error('El producto debe tener al menos 1 imagen');
      }

      // Preparar descripción
      const description = product.description || product.shortDesc || product.name;
      const descriptionText = description.substring(0, 50000);

      // Preparar título (límite de 60 caracteres)
      let title = product.name;
      if (product.brand && !title.toLowerCase().includes(product.brand.toLowerCase())) {
        title = `${product.brand} ${product.name}`;
      }
      title = title.substring(0, 60);

      // ✅PASO:3 Configurar envío ME2 con adopción
      const shippingConfig: any = {
        mode: 'me2',
        methods: [],
        local_pick_up: true,
        free_shipping: false,
        tags: ['self_service_in'], // ✅ Tag para indicar que el vendedor gestionará el envío
      };

      console.log(`📦 Configuración de envío:`, shippingConfig);

      // ✅ PASO 4: Preparar body final
      const itemData: any = {
        title,
        category_id: mlCategoryId,
        price: Number(product.price),
        currency_id: 'MXN',
        available_quantity: 1,
        buying_mode: 'buy_it_now',
        condition: 'new',
        listing_type_id: 'free', // ✅ Publicación gratuita (sin plan contratado)
        description: {
          plain_text: descriptionText,
        },
        pictures: images,
        shipping: shippingConfig
        // No incluir sale_terms por ahora
      };

      // ✅ Extraer atributos de tags si existen (versión segura)
const extractTagValue = (tagPrefix: string): string | null => {
  if (!product?.tags || !Array.isArray(product.tags)) return null;

  // Filtrar solo los valores string
  const stringTags = product.tags.filter((t): t is string => typeof t === 'string');

  const tag = stringTags.find((t) => t.startsWith(tagPrefix));

  return tag ? tag.split(':')[1] ?? null : null;
};

      const mlColor = extractTagValue('ML_COLOR');
      const mlCarrier = extractTagValue('ML_CARRIER');

      // ✅ Agregar atributos obligatorios dinámicamente
      const attributes: any[] = [];
      
      // BRAND (obligatorio en casi todas las categorías)
      if (product.brand) {
        attributes.push({ id: 'BRAND', value_name: product.brand });
      }
      
      // MODEL (obligatorio en electrónicos)
      if (product.model) {
        attributes.push({ id: 'MODEL', value_name: product.model });
      }
      
      // Para celulares (MLM1055): Agregar atributos requeridos
      if (mlCategoryId === 'MLM1055') {
        // COLOR (obligatorio) - usar el del tag si existe, sino genérico
        attributes.push({ 
          id: 'COLOR', 
          value_name: mlColor || 'No especificado' 
        });
        
        // IS_DUAL_SIM (obligatorio)
        attributes.push({ id: 'IS_DUAL_SIM', value_name: 'No' });
        
        // CARRIER (compañía telefónica) - usar el del tag si existe
        attributes.push({ 
          id: 'CARRIER', 
          value_name: mlCarrier || 'Desbloqueado' 
        });
        
        // Si no hay MODEL, agregar genérico
        if (!product.model) {
          attributes.push({ id: 'MODEL', value_name: 'No especificado' });
        }
        
        // Si no hay BRAND, agregar genérico
        if (!product.brand) {
          attributes.push({ id: 'BRAND', value_name: 'Sin marca' });
        }
      }
      
      // Para laptops (MLM1652): Agregar atributos básicos
      if (mlCategoryId === 'MLM1652') {
        if (!product.model) {
          attributes.push({ id: 'MODEL', value_name: 'No especificado' });
        }
        if (!product.brand) {
          attributes.push({ id: 'BRAND', value_name: 'Genérica' });
        }
      }
      
      console.log(`📋 Atributos generados (${attributes.length}):`, attributes);
      
      // Asignar atributos si hay alguno
      if (attributes.length > 0) {
        itemData.attributes = attributes;
      }

      console.log(`📦 Datos finales a publicar:`, {
        title: itemData.title,
        price: itemData.price,
        stock: itemData.available_quantity,
        category: itemData.category_id,
        images: itemData.pictures.length,
        shipping: itemData.shipping.mode
      });

      // ✅ PASO 5: Publicar en ML
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
      console.log(`✅ Producto publicado en ML: ${mlItem.id}`);
      console.log(`🔗 Permalink: ${mlItem.permalink}`);

      // Guardar en BD
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
      console.error('❌ Error publishing to ML:', {
        message: error.response?.data?.message || error.message,
        cause: error.response?.data?.cause,
        error: error.response?.data?.error,
        status: error.response?.status,
        fullResponse: JSON.stringify(error.response?.data, null, 2) // ← NUEVO: ver respuesta completa
      });

      let errorMessage = 'Error al publicar en Mercado Libre';
      
      if (error.response?.data) {
        const mlError = error.response.data;
        if (mlError.message) {
          errorMessage = mlError.message;
        } else if (mlError.cause && Array.isArray(mlError.cause)) {
          const errorMessages = mlError.cause
            .filter((c: any) => c.type === 'error')
            .map((c: any) => c.message);
          
          if (errorMessages.length > 0) {
            errorMessage = errorMessages.join('; ');
          }
        }
      }

      throw new Error(errorMessage);
    }
  }

  // 6. Sugerir categoría (mantener por compatibilidad)
  async suggestCategory(title: string, siteId: string, accessToken: string): Promise<string> {
    return this.getValidLeafCategory(title, siteId, accessToken);
  }

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

      console.log(`✅ Precio actualizado en ML: ${mlItemId} -> $${newPrice}`);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Error updating ML price:', error.response?.data || error.message);
      throw new Error('Error al actualizar precio en Mercado Libre');
    }
  }

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

      console.log(`✅ Stock actualizado en ML: ${mlItemId} -> ${quantity}`);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Error updating ML stock:', error.response?.data || error.message);
      throw new Error('Error al actualizar stock en Mercado Libre');
    }
  }

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

      await prisma.mercadoLibreProduct.updateMany({
        where: { mlItemId },
        data: { status },
      });

      console.log(`✅ Estado actualizado en ML: ${mlItemId} -> ${status}`);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Error updating ML status:', error.response?.data || error.message);
      throw new Error('Error al actualizar estado en Mercado Libre');
    }
  }

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

      await prisma.mercadoLibreProduct.updateMany({
        where: { mlItemId },
        data: { status: 'closed' },
      });

      console.log(`✅ Producto cerrado en ML: ${mlItemId}`);
      return { success: true };
    } catch (error: any) {
      console.error('❌ Error deleting ML product:', error.response?.data || error.message);
      throw new Error('Error al eliminar producto de Mercado Libre');
    }
  }

  async getUserInfo(): Promise<any> {
    try {
      const accessToken = await this.getValidAccessToken();

      const response = await axios.get(`${ML_API_URL}/users/me`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      return response.data;
    } catch (error: any) {
      console.error('❌ Error getting ML user info:', error.response?.data || error.message);
      throw new Error('Error al obtener información del usuario de Mercado Libre');
    }
  }
}

export default new MercadoLibreService();