// src/controllers/productController.ts - Simplificado sin Redis
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';

const prisma = new PrismaClient();

// Schemas de validación con Zod
const productCreateSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().min(10),
  shortDesc: z.string().max(500).optional(),
  price: z.number().positive(),
  comparePrice: z.number().positive().optional(),
  categoryId: z.string().cuid(),
  brand: z.string().optional(),
  model: z.string().optional(),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  weight: z.number().positive().optional(),
  stockType: z.enum(['PHYSICAL', 'DROPSHIPPING', 'BOTH']),
  stockCount: z.number().int().min(0),
  lowStockThreshold: z.number().int().min(0).default(5),
  isActive: z.boolean().default(true),
  isFeatured: z.boolean().default(false),
  isDigital: z.boolean().default(false),
  tags: z.array(z.string()).default([]),
  metaTitle: z.string().max(60).optional(),
  metaDesc: z.string().max(160).optional(),
  images: z.array(z.any()).optional()
});

const productUpdateSchema = productCreateSchema.partial();

const productQuerySchema = z.object({
  page: z.string().optional().default('1').transform(Number),
  limit: z.string().optional().default('12').transform(Number),
  categoryId: z.string().optional(),
  brand: z.string().optional(),
  minPrice: z.string().optional().transform(val => val ? Number(val) : undefined),
  maxPrice: z.string().optional().transform(val => val ? Number(val) : undefined),
  search: z.string().optional(),
  sortBy: z.enum(['name', 'price', 'createdAt', 'salesCount', 'rating']).default('createdAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  featured: z.string().optional().transform(val => val === 'true'),
  inStock: z.string().optional().transform(val => val === 'true')
});

// Generar slug único
const generateSlug = async (name: string, id?: string): Promise<string> => {
  const baseSlug = name
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .trim();

  let slug = baseSlug;
  let counter = 1;

  while (true) {
    const existing = await prisma.product.findFirst({
      where: {
        slug,
        ...(id && { id: { not: id } })
      }
    });

    if (!existing) break;
    slug = `${baseSlug}-${counter}`;
    counter++;
  }

  return slug;
};

// Crear producto
export const createProduct = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validation = productCreateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const data = validation.data;

    // Verificar SKU duplicado si se proporciona
    if (data.sku) {
      const existingSKU = await prisma.product.findFirst({
        where: { 
          sku: data.sku,
          isActive: true 
        }
      });

      if (existingSKU) {
        return res.status(409).json({
          error: 'El SKU ya existe. Por favor, usa un SKU diferente.'
        });
      }
    }


    const slug = await generateSlug(data.name);

    // Generar términos de búsqueda
    const searchTerms = [
      data.name,
      data.brand,
      data.model,
      ...data.tags
    ].filter(Boolean).join(' ').toLowerCase();

    const product = await prisma.product.create({
      data: {
        ...data,
        slug,
        searchTerms,
        images: data.images || [],
      }
    });

    console.log(`Product created: ${product.id} by user: ${req.user?.id}`);

    res.status(201).json({
  message: 'Producto creado exitosamente',
  product: {
    id: product.id,
    name: product.name,
    slug: product.slug,
    price: Number(product.price),
    stockCount: product.stockCount,
    isActive: product.isActive,
    isFeatured: product.isFeatured,
    brand: product.brand,
    category: null, // Se puede buscar después
    createdAt: product.createdAt,
    comparePrice: product.comparePrice ? Number(product.comparePrice) : null,
    sku: product.sku
  }
});

  } catch (error) {
    console.error('Error creating product:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// REEMPLAZA tu función getProducts con esta versión compatible con MySQL

export const getProducts = async (req: Request, res: Response) => {
  console.log('\n🔥 ===== MYSQL COMPATIBLE GETPRODUCTS =====');
  console.log('🔍 Query params:', req.query);

  // Evitar cache
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');

  try {
    // Extraer y validar parámetros de manera segura
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));
    
    // Parámetros de filtro
    const categoryId = req.query.categoryId as string;
    const search = req.query.search as string;
    const brand = req.query.brand as string;
    const featured = req.query.featured === 'true';
    const inStock = req.query.inStock === 'true';
    
    // Parámetros de precio
    const minPrice = req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined;
    const maxPrice = req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined;
    
    // Parámetros de ordenamiento
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortOrder = (req.query.sortOrder as string) === 'asc' ? 'asc' : 'desc';
    
    console.log('📋 Processed params:', {
      page,
      limit,
      categoryId: categoryId || 'none',
      search: search || 'none',
      brand: brand || 'none',
      featured,
      inStock,
      minPrice,
      maxPrice,
      sortBy,
      sortOrder
    });

    const skip = (page - 1) * limit;

    // Construir WHERE clause compatible con MySQL
    const where: any = {
      isActive: true
    };

    // Filtro por categoría
    if (categoryId && categoryId.trim() !== '') {
      where.categoryId = categoryId.trim();
      console.log('🔹 Added categoryId filter:', categoryId);
    }

    // Filtro por marca - SIN mode: 'insensitive'
    if (brand && brand.trim() !== '') {
      where.brand = { 
        contains: brand.trim()
        // ✅ NO USAR mode: 'insensitive' en MySQL
      };
      console.log('🔹 Added brand filter:', brand);
    }

    // Filtro por búsqueda - COMPATIBLE CON MYSQL
    if (search && search.trim() !== '') {
      const searchTerm = search.trim();
      where.OR = [
        { 
          name: { 
            contains: searchTerm 
            // ✅ MySQL es case-insensitive por defecto
          } 
        },
        { 
          description: { 
            contains: searchTerm 
          } 
        },
        { 
          brand: { 
            contains: searchTerm 
          } 
        },
        { 
          sku: { 
            contains: searchTerm 
          } 
        }
      ];
      console.log('🔹 Added MySQL-compatible search filter:', searchTerm);
    }

    // Filtro por productos destacados
    if (featured) {
      where.isFeatured = true;
      console.log('🔹 Added featured filter');
    }

    // Filtro por stock
    if (inStock) {
      where.inStock = true;
      where.stockCount = { gt: 0 };
      console.log('🔹 Added inStock filter');
    }

    // Filtro por precio
    if (minPrice !== undefined || maxPrice !== undefined) {
      where.price = {};
      if (minPrice !== undefined && !isNaN(minPrice)) {
        where.price.gte = minPrice;
        console.log('🔹 Added minPrice filter:', minPrice);
      }
      if (maxPrice !== undefined && !isNaN(maxPrice)) {
        where.price.lte = maxPrice;
        console.log('🔹 Added maxPrice filter:', maxPrice);
      }
    }

    console.log('🔍 Final WHERE clause (MySQL compatible):', JSON.stringify(where, null, 2));

    // Construir ORDER BY con validación
    let orderBy: any = { createdAt: 'desc' }; // default
    
    const allowedSortFields = ['name', 'price', 'createdAt', 'salesCount', 'rating'];
    if (allowedSortFields.includes(sortBy)) {
      orderBy = { [sortBy]: sortOrder };
    }
    
    console.log('📊 ORDER BY:', orderBy);
    console.log('📄 PAGINATION - Skip:', skip, 'Take:', limit);

    console.log('\n🗃️  Executing MySQL-compatible Prisma query...');
    const startTime = Date.now();

    // Ejecutar query SIN mode: 'insensitive'
    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy,
        skip,
        take: limit,
        include: {
          category: {
            select: { id: true, name: true, slug: true }
          },
          variants: {
            where: { isActive: true },
            orderBy: { sortOrder: 'asc' }
          },
          _count: {
            select: { reviews: true }
          }
        }
      }),
      
      prisma.product.count({ where })
    ]);

    const queryTime = Date.now() - startTime;
    console.log(`⏱️  Query executed successfully in ${queryTime}ms`);

    console.log(`📦 Results: ${products.length} products found (total: ${total})`);

    if (products.length > 0) {
      console.log('📦 Sample product:', {
        id: products[0].id,
        name: products[0].name,
        categoryId: products[0].categoryId,
        category: products[0].category?.name
      });
    } else {
      console.log('⚠️  No products found with current filters');
      
      if (search) {
        const totalProducts = await prisma.product.count({ where: { isActive: true } });
        console.log(`📊 Total active products in DB: ${totalProducts}`);
      }
    }

    // Procesar productos para respuesta
    console.log('\n🔄 Processing response...');
    const processedProducts = products.map(product => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      shortDesc: product.shortDesc,
      price: Number(product.price),
      comparePrice: product.comparePrice ? Number(product.comparePrice) : null,
      images: product.images,
      brand: product.brand,
      model: product.model,
      inStock: product.inStock,
      stockCount: product.stockCount,
      isFeatured: product.isFeatured,
      rating: product.rating ? Number(product.rating) : null,
      reviewCount: product._count?.reviews || 0,
      category: product.category,
      variants: product.variants || [],
      createdAt: product.createdAt
    }));

    const response = {
      data: processedProducts,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    };

    console.log('✅ Sending MySQL-compatible response with', processedProducts.length, 'products');
    console.log('🔥 =====================================\n');

    res.json(response);

  } catch (error) {
    console.error('\n❌ ===============================');
    console.error('❌ ERROR in MySQL getProducts:', error);
    
    if (error instanceof Error) {
      console.error('❌ Error message:', error.message);
      console.error('❌ Error stack:', error.stack);
    }
    
    console.error('❌ Query params that caused error:', req.query);
    console.error('❌ ===============================\n');
    
    const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
    
    res.status(500).json({ 
      error: 'Error interno del servidor',
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined,
      timestamp: new Date().toISOString()
    });
  }
};

// Obtener producto por slug
export const getProductBySlug = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const product = await prisma.product.findUnique({
      where: { slug, isActive: true },
      include: {
        category: {
          select: { id: true, name: true, slug: true }
        },
        variants: {
          where: { isActive: true },
          orderBy: { sortOrder: 'asc' }
        },
        reviews: {
          where: { isApproved: true },
          include: {
            user: {
              select: { id: true, firstName: true, lastName: true }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 10
        },
        _count: {
          select: { reviews: true }
        }
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    const response = {
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,
      shortDesc: product.shortDesc,
      price: Number(product.price),
      comparePrice: product.comparePrice ? Number(product.comparePrice) : null,
      images: product.images,
      brand: product.brand,
      model: product.model,
      inStock: product.inStock,
      stockCount: product.trackInventory ? product.stockCount : null,
      category: product.category,
      variants: product.variants,
      reviews: product.reviews,
      createdAt: product.createdAt,
      updatedAt: product.updatedAt
    };

    res.json(response);

  } catch (error) {
    console.error('Error getting product by slug:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener productos destacados
export const getFeaturedProducts = async (req: Request, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      where: {
        isActive: true,
        isFeatured: true,
        inStock: true
      },
      orderBy: { salesCount: 'desc' },
      take: 8,
      include: {
        category: {
          select: { name: true, slug: true }
        }
      }
    });

    const processedProducts = products.map(product => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      description: product.description,        // ✅ AÑADIR
      shortDesc: product.shortDesc,
      price: Number(product.price),
      comparePrice: product.comparePrice ? Number(product.comparePrice) : null,
      images: product.images,
      rating: product.rating ? Number(product.rating) : null,
      reviewCount: product.reviewCount,
      category: product.category
    }));

    res.json(processedProducts);

  } catch (error) {
    console.error('Error getting featured products:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Actualizar producto
export const updateProduct = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validation = productUpdateSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const data = validation.data;

    // Verificar que el producto existe
    const existingProduct = await prisma.product.findUnique({
      where: { id }
    });

    if (!existingProduct) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    // Generar nuevo slug si el nombre cambió
    let slug = existingProduct.slug;
    if (data.name && data.name !== existingProduct.name) {
      slug = await generateSlug(data.name, id);
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: {
        ...data,
        slug,
        updatedAt: new Date()
      }
    });

    console.log(`Product updated: ${id} by user: ${req.user?.id}`);

    res.json({
      message: 'Producto actualizado exitosamente',
      product: {
        id: updatedProduct.id,
        name: updatedProduct.name,
        slug: updatedProduct.slug,
        price: Number(updatedProduct.price)
      }
    });

  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Eliminar producto (soft delete)
export const deleteProduct = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id },
      select: { id: true, name: true }
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    // Soft delete
    await prisma.product.update({
      where: { id },
      data: { 
        isActive: false,
        updatedAt: new Date()
      }
    });

    console.log(`Product deleted: ${id} by user: ${req.user?.id}`);

    res.json({ 
      message: 'Producto eliminado exitosamente'
    });

  } catch (error) {
    console.error('Error deleting product:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener todos los productos para admin
export const getProductsAdmin = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const products = await prisma.product.findMany({
      where: { isActive: true },
      include: {
        category: {
          select: { id: true, name: true, slug: true }
        },
        variants: {
          orderBy: { sortOrder: 'asc' }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const processedProducts = products.map(product => ({
      id: product.id,
      name: product.name,
      slug: product.slug,
      price: Number(product.price),
      stockCount: product.stockCount,
      isActive: product.isActive,
      isFeatured: product.isFeatured,
      brand: product.brand,
      category: product.category,
      createdAt: product.createdAt
    }));

    res.json({ products: processedProducts });

  } catch (error) {
    console.error('Error getting admin products:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener producto por ID para admin
export const getProductById = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const product = await prisma.product.findUnique({
      where: { id },
      include: {
        category: {
          select: { id: true, name: true, slug: true }
        }
      }
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    res.json(product);

  } catch (error) {
    console.error('Error getting product by ID:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};