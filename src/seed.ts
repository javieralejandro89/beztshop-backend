// src/seed.ts - Versión con más categorías
import { PrismaClient } from '@prisma/client';
import { hashPassword } from './middleware/auth';

const prisma = new PrismaClient();

async function main() {
  console.log('Iniciando seed...');

  // Crear usuario admin
  const adminPassword = await hashPassword('Admin123!@#');
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@servipro-garcia.com' },
    update: {},
    create: {
      email: 'admin@servipro-garcia.com',
      password: adminPassword,
      firstName: 'Admin',
      lastName: 'ServiPro',
      role: 'ADMIN',
      userLevel: 'REGULAR',
      isActive: true
    }
  });

  console.log('Usuario admin creado:', admin.email);

  // Crear categorías
  const categories = [
    {
      name: 'Smartphones',
      slug: 'smartphones',
      description: 'Teléfonos inteligentes de última generación',
      sortOrder: 1
    },
    {
      name: 'Laptops',
      slug: 'laptops',
      description: 'Computadoras portátiles para trabajo y entretenimiento',
      sortOrder: 2
    },
    {
      name: 'Tablets',
      slug: 'tablets',
      description: 'Tabletas para productividad y entretenimiento',
      sortOrder: 3
    },
    {
      name: 'Accesorios',
      slug: 'accesorios',
      description: 'Accesorios electrónicos y complementos',
      sortOrder: 4
    },
    {
      name: 'Cargadores',
      slug: 'cargadores',
      description: 'Cargadores y cables para dispositivos',
      sortOrder: 5
    }
  ];

  console.log('Creando categorías...');
  
  for (const categoryData of categories) {
    const category = await prisma.category.upsert({
      where: { slug: categoryData.slug },
      update: {},
      create: {
        ...categoryData,
        isActive: true
      }
    });
    console.log(`Categoría creada: ${category.name}`);
  }

  // Obtener la categoría de smartphones para crear productos
  const smartphoneCategory = await prisma.category.findUnique({
    where: { slug: 'smartphones' }
  });

  const laptopCategory = await prisma.category.findUnique({
    where: { slug: 'laptops' }
  });

  // Crear productos de ejemplo
  if (smartphoneCategory) {
    const products = [
      {
        name: 'iPhone 15 Pro Max',
        slug: 'iphone-15-pro-max',
        description: 'El iPhone más avanzado con chip A17 Pro y cámara de 48MP',
        shortDesc: 'iPhone 15 Pro Max - 256GB',
        price: 1199.99,
        comparePrice: 1299.99,
        categoryId: smartphoneCategory.id,
        brand: 'Apple',
        model: '15 Pro Max',
        stockType: 'PHYSICAL' as const,
        stockCount: 15,
        isActive: true,
        isFeatured: true
      },
      {
        name: 'Samsung Galaxy S24 Ultra',
        slug: 'samsung-galaxy-s24-ultra',
        description: 'Samsung Galaxy con S Pen integrado y cámara de 200MP',
        shortDesc: 'Galaxy S24 Ultra - 512GB',
        price: 1099.99,
        categoryId: smartphoneCategory.id,
        brand: 'Samsung',
        model: 'Galaxy S24 Ultra',
        stockType: 'PHYSICAL' as const,
        stockCount: 8,
        isActive: true,
        isFeatured: true
      }
    ];

    for (const productData of products) {
      const product = await prisma.product.upsert({
        where: { slug: productData.slug },
        update: {},
        create: {
          ...productData,
          searchTerms: `${productData.name} ${productData.brand} ${productData.model}`.toLowerCase(),
          images: []
        }
      });
      console.log(`Producto creado: ${product.name}`);
    }
  }

  // Crear producto laptop si existe la categoría
  if (laptopCategory) {
    const laptopProduct = await prisma.product.upsert({
      where: { slug: 'macbook-pro-m3' },
      update: {},
      create: {
        name: 'MacBook Pro M3',
        slug: 'macbook-pro-m3',
        description: 'MacBook Pro con chip M3 para rendimiento profesional',
        shortDesc: 'MacBook Pro M3 - 16 pulgadas',
        price: 2499.99,
        categoryId: laptopCategory.id,
        brand: 'Apple',
        model: 'MacBook Pro M3',
        stockType: 'PHYSICAL',
        stockCount: 5,
        isActive: true,
        isFeatured: false,
        searchTerms: 'macbook pro m3 apple laptop',
        images: []
      }
    });
    console.log(`Producto laptop creado: ${laptopProduct.name}`);
  }

  console.log('Seed completado!');
  console.log('Credenciales: admin@servipro-garcia.com / Admin123!@#');
  console.log('Categorías creadas:', categories.length);
}

main()
  .catch((e) => {
    console.error('Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });