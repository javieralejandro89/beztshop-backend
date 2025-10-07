// src/controllers/imageController.ts - Controlador para imágenes
import { Request, Response } from 'express';
import { PrismaClient } from '@prisma/client';
import { AuthenticatedRequest } from '../middleware/auth';
import { deleteImage } from '../config/cloudinary';

const prisma = new PrismaClient();

// Subir imágenes de producto
export const uploadProductImages = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const files = req.files as Express.Multer.File[];
    
    if (!files || files.length === 0) {
      return res.status(400).json({ error: 'No se proporcionaron archivos' });
    }

    // Procesar las imágenes subidas
    const uploadedImages = files.map(file => ({
      url: file.path,
      publicId: file.filename,
      originalName: file.originalname,
    }));

    res.json({
      message: 'Imágenes subidas exitosamente',
      images: uploadedImages
    });

  } catch (error) {
    console.error('Error uploading images:', error);
    res.status(500).json({ error: 'Error al subir imágenes' });
  }
};

// Eliminar imagen de producto
export const deleteProductImage = async (req: Request, res: Response) => {
  try {
    const { publicId } = req.params;
    
    console.log('Eliminando imagen con publicId:', publicId);
    
    // Solo eliminar de Cloudinary
    await deleteImage(publicId);
    
    res.json({ 
      message: 'Imagen eliminada exitosamente',
      publicId 
    });
    
  } catch (error) {
    console.error('Error deleting image:', error);
    res.status(500).json({ error: 'Error al eliminar imagen' });
  }
};

// Actualizar imágenes de producto
export const updateProductImages = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { productId } = req.params;
    const { images } = req.body;

    // Validar que el producto existe
    const product = await prisma.product.findUnique({
      where: { id: productId }
    });

    if (!product) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    // Actualizar las imágenes del producto
    const updatedProduct = await prisma.product.update({
      where: { id: productId },
      data: { images: images || [] }
    });

    res.json({
      message: 'Imágenes del producto actualizadas',
      product: {
        id: updatedProduct.id,
        images: updatedProduct.images
      }
    });

  } catch (error) {
    console.error('Error updating product images:', error);
    res.status(500).json({ error: 'Error al actualizar imágenes del producto' });
  }
};