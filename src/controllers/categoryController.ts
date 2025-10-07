// src/controllers/categoryController.ts - Controlador de categorías
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import { AuthenticatedRequest } from '../middleware/auth';

const prisma = new PrismaClient();

// Schemas de validación
const categoryCreateSchema = z.object({
  name: z.string().min(1, 'Nombre es requerido').max(100),
  description: z.string().optional(),
  isActive: z.boolean().default(true),
  sortOrder: z.number().int().min(0).default(0),
  parentId: z.string().optional()
});

const categoryUpdateSchema = categoryCreateSchema.partial();

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
    const existing = await prisma.category.findFirst({
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

// Obtener todas las categorías (público)
export const getCategories = async (req: Request, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      where: { isActive: true },
      orderBy: [
        { sortOrder: 'asc' },
        { name: 'asc' }
      ],
      include: {
        _count: {
          select: {
            products: {
              where: { isActive: true }
            }
          }
        }
      }
    });

    const processedCategories = categories.map(category => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      productCount: category._count.products,
      sortOrder: category.sortOrder,
      createdAt: category.createdAt
    }));

    res.json({
      categories: processedCategories
    });

  } catch (error) {
    console.error('Error getting categories:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener categoría por slug
export const getCategoryBySlug = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

    const category = await prisma.category.findUnique({
      where: { slug, isActive: true },
      include: {
        products: {
          where: { isActive: true },
          take: 20,
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            name: true,
            slug: true,
            price: true,
            images: true,
            brand: true,
            isFeatured: true
          }
        },
        _count: {
          select: {
            products: {
              where: { isActive: true }
            }
          }
        }
      }
    });

    if (!category) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    const response = {
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      products: category.products,
      totalProducts: category._count.products,
      createdAt: category.createdAt
    };

    res.json(response);

  } catch (error) {
    console.error('Error getting category by slug:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Crear categoría (solo admin)
export const createCategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const validation = categoryCreateSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const data = validation.data;
    const slug = await generateSlug(data.name);

    const category = await prisma.category.create({
      data: {
        ...data,
        slug
      }
    });

    console.log(`Category created: ${category.id} by user: ${req.user?.id}`);

    res.status(201).json({
      message: 'Categoría creada exitosamente',
      category: {
        id: category.id,
        name: category.name,
        slug: category.slug
      }
    });

  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Actualizar categoría (solo admin)
export const updateCategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;
    const validation = categoryUpdateSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({
        error: 'Datos inválidos',
        details: validation.error.issues
      });
    }

    const data = validation.data;

    // Verificar que la categoría existe
    const existingCategory = await prisma.category.findUnique({
      where: { id }
    });

    if (!existingCategory) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    // Generar nuevo slug si el nombre cambió
    let slug = existingCategory.slug;
    if (data.name && data.name !== existingCategory.name) {
      slug = await generateSlug(data.name, id);
    }

    const updatedCategory = await prisma.category.update({
      where: { id },
      data: {
        ...data,
        slug,
        updatedAt: new Date()
      }
    });

    console.log(`Category updated: ${id} by user: ${req.user?.id}`);

    res.json({
      message: 'Categoría actualizada exitosamente',
      category: {
        id: updatedCategory.id,
        name: updatedCategory.name,
        slug: updatedCategory.slug
      }
    });

  } catch (error) {
    console.error('Error updating category:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Eliminar categoría (soft delete, solo admin)
export const deleteCategory = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { id } = req.params;

    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            products: {
              where: { isActive: true }
            }
          }
        }
      }
    });

    if (!category) {
      return res.status(404).json({ error: 'Categoría no encontrada' });
    }

    // Verificar si tiene productos activos
    if (category._count.products > 0) {
      return res.status(400).json({ 
        error: 'No se puede eliminar una categoría que tiene productos activos' 
      });
    }

    // Soft delete
    await prisma.category.update({
      where: { id },
      data: { 
        isActive: false,
        updatedAt: new Date()
      }
    });

    console.log(`Category deleted: ${id} by user: ${req.user?.id}`);

    res.json({ 
      message: 'Categoría eliminada exitosamente'
    });

  } catch (error) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};

// Obtener todas las categorías para admin
export const getCategoriesAdmin = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const categories = await prisma.category.findMany({
      orderBy: [
        { sortOrder: 'asc' },
        { name: 'asc' }
      ],
      include: {
        _count: {
          select: {
            products: true
          }
        }
      }
    });

    const processedCategories = categories.map(category => ({
      id: category.id,
      name: category.name,
      slug: category.slug,
      description: category.description,
      isActive: category.isActive,
      sortOrder: category.sortOrder,
      productCount: category._count.products,
      createdAt: category.createdAt,
      updatedAt: category.updatedAt
    }));

    res.json({ 
      categories: processedCategories 
    });

  } catch (error) {
    console.error('Error getting admin categories:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
};