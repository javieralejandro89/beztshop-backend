// src/services/pdfService.ts - Generador de facturas PDF con colores Dark Tech
import PDFDocument from 'pdfkit';
import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';

const prisma = new PrismaClient();

interface InvoiceData {
  order: any;
  user: any;
  company: {
    name: string;        
    city: string;
    zipCode: string;
    country: string;
    phone: string;
    email: string;
    website: string;
    primaryColor: string;
    secondaryColor: string;
  };
}

export class PDFService {
  static async generateInvoice(orderId: string, userId: string): Promise<Buffer> {
    // Obtener datos del pedido
    const order = await prisma.order.findFirst({
      where: {
        id: orderId,
        userId: userId
      },
      include: {
        items: {
          include: {
            product: {
              select: {
                id: true,
                name: true,
                sku: true
              }
            }
          }
        },
        user: {
          select: {
            firstName: true,
            lastName: true,
            email: true
          }
        }
      }
    });

    if (!order) {
      throw new Error('Pedido no encontrado');
    }

    // Datos de la empresa con colores Dark Tech
    const companyData = {
      name: 'Tech Store',      
      city: 'México, CDMX',
      zipCode: '03100',
      country: 'México',
      phone: '+52 998 578 0385',
      email: 'atencionalcliente@beztshop.com',
      website: 'www.beztshop.com',
      primaryColor: '#FFD700', // Dorado - Color principal Dark Tech
      secondaryColor: '#00C8FF' // Azul neón - Color secundario Dark Tech
    };

    return this.createPDF({
      order,
      user: order.user,
      company: companyData
    });
  }

  private static createPDF(data: InvoiceData): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ 
          margin: 50,
          size: 'LETTER',
          bufferPages: true
        });
        const chunks: Buffer[] = [];

        doc.on('data', (chunk) => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));

        // Header de la empresa con logo
        this.generateHeader(doc, data.company);
        
        // Información del cliente y pedido
        this.generateCustomerInformation(doc, data);
        
        // Tabla de productos
        this.generateInvoiceTable(doc, data.order);
        
        // Footer mejorado
        this.generateFooter(doc, data.company);

        doc.end();
      } catch (error) {
        reject(error);
      }
    });
  }

  private static generateHeader(doc: PDFKit.PDFDocument, company: any) {
    // Fondo del header
    doc
      .rect(0, 0, 612, 150)
      .fillColor('#f8fafc')
      .fill();

    // Línea decorativa superior - Dorado
    doc
      .rect(0, 0, 612, 8)
      .fillColor(company.primaryColor)
      .fill();

    // Intentar cargar el logo
    this.addLogo(doc, 50, 25, 80, 80);

    // Información de la empresa - Centro
    doc
      .fillColor('#0D0D0D') // Negro carbón para texto principal
      .fontSize(24)
      .font('Helvetica-Bold')
      .text(company.name, 150, 35);

    doc
      .fillColor('#1F1F1F') // Gris oscuro para texto secundario
      .fontSize(11)
      .font('Helvetica')
      .text(company.address, 150, 65)
      .text(`${company.city}, ${company.zipCode}`, 150, 80)
      .text(company.country, 150, 95);

    // Cuadro de contacto - Derecha
    doc
      .rect(415, 25, 140, 90)
      .fillColor('#f1f5f9')
      .fill()
      .strokeColor('#e2e8f0')
      .lineWidth(1)
      .stroke();

    doc
      .fillColor('#FFD700') // Dorado para título
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('CONTACTO', 430, 35);

    doc
      .fillColor('#1F1F1F') // Gris oscuro para info de contacto
      .fontSize(9)
      .font('Helvetica')
      .text(`Tel: ${company.phone}`, 430, 50)
      .fontSize(8)
      .text(`Email: ${company.email}`, 430, 65, { width: 125, ellipsis: true })
      .fontSize(9)
      .text(`Web: ${company.website}`, 430, 85);

    // Línea decorativa inferior - Azul neón
    doc
      .rect(0, 142, 612, 2)
      .fillColor(company.secondaryColor)
      .fill();

    doc.moveDown(2);
  }

  private static addLogo(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number) {
    try {
      // Intentar cargar el logo desde diferentes ubicaciones posibles
      const possiblePaths = [
        path.join(process.cwd(), 'public', 'brandpdf.png'),
        path.join(process.cwd(), '../frontend/public/brandpdf.png'),
        path.join(process.cwd(), 'assets', 'brandpdf.png'),
        path.join(__dirname, '../../public/brandpdf.png')
      ];

      let logoPath = null;
      for (const testPath of possiblePaths) {
        if (fs.existsSync(testPath)) {
          logoPath = testPath;
          break;
        }
      }

      if (logoPath) {
        doc.image(logoPath, x, y, { width, height });
        console.log('✅ Logo cargado desde:', logoPath);
      } else {
        // Fallback: crear placeholder con estilo
        this.createLogoPlaceholder(doc, x, y, width, height);
      }
    } catch (error) {      
      this.createLogoPlaceholder(doc, x, y, width, height);
    }
  }

  private static createLogoPlaceholder(doc: PDFKit.PDFDocument, x: number, y: number, width: number, height: number) {
    // Crear un placeholder con colores Dark Tech
    doc
      .rect(x, y, width, height)
      .fillColor('#FFD700') // Dorado
      .fill()
      .strokeColor('#00C8FF') // Azul neón para el borde
      .lineWidth(2)
      .stroke();
    
    // Agregar texto SPG
    doc
      .fillColor('#0D0D0D') // Negro para el texto
      .fontSize(16)
      .font('Helvetica-Bold')
      .text('SPG', x + width/2 - 15, y + height/2 - 8);
  }

  private static generateCustomerInformation(doc: PDFKit.PDFDocument, data: InvoiceData) {
    const customerInformationTop = 180;

    // Título FACTURA con estilo Dark Tech
    doc
      .rect(50, customerInformationTop, 512, 40)
      .fillColor('#0D0D0D') // Negro carbón
      .fill();

    doc
      .fillColor('#FFD700') // Dorado para el texto
      .fontSize(20)
      .font('Helvetica-Bold')
      .text('FACTURA / INVOICE', 60, customerInformationTop + 12);

    // Información del pedido - Lado izquierdo
    const infoTop = customerInformationTop + 60;
    doc
      .rect(50, infoTop, 250, 130)
      .fillColor('#f8fafc')
      .fill()
      .strokeColor('#e2e8f0')
      .lineWidth(1)
      .stroke();

    doc
      .fillColor('#FFD700') // Dorado para títulos
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('INFORMACIÓN DEL PEDIDO', 60, infoTop + 10);

    doc
      .fillColor('#1F1F1F') // Gris oscuro para texto
      .fontSize(10)
      .font('Helvetica')
      .text(`Número: ${data.order.orderNumber}`, 60, infoTop + 30)
      .text(`Fecha: ${new Date(data.order.createdAt).toLocaleDateString('es-ES')}`, 60, infoTop + 45)
      .text(`Estado: ${this.getStatusText(data.order.status)}`, 60, infoTop + 60);

    // Información de pago
    if (data.order.paymentMethod) {
      const paymentText = this.getPaymentMethodText(data.order.paymentMethod, data.order.paymentId);
      doc
        .fillColor('#00C8FF') // Azul neón para método de pago
        .fontSize(9)
        .font('Helvetica-Bold')
        .text(`Método de pago: ${paymentText}`, 60, infoTop + 85);
    }

    if (data.order.paymentStatus === 'PAID') {
      doc
        .fillColor('#16A34A') // Verde para PAGADO (mantener por claridad)
        .fontSize(9)
        .font('Helvetica-Bold')
        .text('✓ PAGADO', 60, infoTop + 100);
    }

    // Cliente - Lado derecho
    doc
      .rect(312, infoTop, 250, 130)
      .fillColor('#f8fafc')
      .fill()
      .strokeColor('#e2e8f0')
      .lineWidth(1)
      .stroke();

    doc
      .fillColor('#FFD700') // Dorado para título
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('FACTURAR A', 322, infoTop + 10);

    doc
      .fillColor('#1F1F1F') // Gris oscuro para info del cliente
      .fontSize(10)
      .font('Helvetica')
      .text(`${data.user.firstName} ${data.user.lastName}`, 322, infoTop + 30)
      .text(data.user.email, 322, infoTop + 45);

    // Dirección de envío
    if (data.order.shippingAddress) {
      const addr = JSON.parse(data.order.shippingAddress);
      doc
        .fillColor('#FFD700') // Dorado para título
        .fontSize(10)
        .font('Helvetica-Bold')
        .text('ENVIAR A:', 322, infoTop + 75);
        
      doc
        .fillColor('#1F1F1F') // Gris oscuro para dirección
        .fontSize(9)
        .font('Helvetica')
        .text(addr.name || '', 322, infoTop + 90)
        .text(addr.street || '', 322, infoTop + 100)
        .text(`${addr.city}, ${addr.state} ${addr.zipCode}`, 322, infoTop + 110);
    }
  }

  private static generateInvoiceTable(doc: PDFKit.PDFDocument, order: any) {
    const invoiceTableTop = 370;
    
    // Header de tabla con estilo Dark Tech
    doc
      .rect(50, invoiceTableTop, 512, 25)
      .fillColor('#1F1F1F') // Gris oscuro
      .fill();

    doc
      .fillColor('#FFD700') // Dorado para headers
      .fontSize(10)
      .font('Helvetica-Bold')
      // Producto
      .text('PRODUCTO', 60, invoiceTableTop + 8)
      // SKU
      .text('SKU', 210, invoiceTableTop + 8)
      // Cantidad
      .text('CANT.', 290, invoiceTableTop + 8, { width: 50, align: 'center' })
      // Precio unitario
      .text('PRECIO UNIT.', 350, invoiceTableTop + 8, { width: 70, align: 'right' })
      // Total
      .text('TOTAL', 430, invoiceTableTop + 8, { width: 100, align: 'right' });

    // Productos con filas alternadas
    let position = invoiceTableTop + 30;
    
    order.items.forEach((item: any, index: number) => {
      this.generateTableRow(
        doc,
        position,
        item.productName,
        item.product?.sku || 'N/A',
        item.quantity.toString(),
        `$${Number(item.price).toFixed(2)}`,
        `$${Number(item.totalPrice).toFixed(2)}`,
        index % 2 === 0 // Alternar colores
      );
      
      position += 22;
    });

    // Línea de separación antes de totales
    doc
      .strokeColor('#cbd5e1')
      .lineWidth(1)
      .moveTo(50, position + 10)
      .lineTo(562, position + 10)
      .stroke();

    position += 30;

    // Cuadro de totales
    const totalsBoxTop = position;
    doc
      .rect(350, totalsBoxTop, 212, 120)
      .fillColor('#f8fafc')
      .fill()
      .strokeColor('#e2e8f0')
      .lineWidth(1)
      .stroke();

    // Subtotal
    this.generateTotalRow(doc, position, 'Subtotal:', `$${Number(order.subtotal).toFixed(2)}`);
    position += 20;

    // Impuestos
    if (Number(order.taxAmount) > 0) {
      this.generateTotalRow(doc, position, 'Impuestos:', `$${Number(order.taxAmount).toFixed(2)}`);
      position += 20;
    }

    // Envío
    if (Number(order.shippingAmount) > 0) {
      this.generateTotalRow(doc, position, 'Envío:', `$${Number(order.shippingAmount).toFixed(2)}`);
      position += 20;
    }

    // Descuento
    if (Number(order.discountAmount) > 0) {
      this.generateTotalRow(doc, position, 'Descuento:', `-$${Number(order.discountAmount).toFixed(2)}`, '#dc2626');
      position += 20;
    }

    // Total final con estilo Dark Tech
    doc
      .rect(350, position + 5, 212, 25)
      .fillColor('#FFD700') // Dorado para total
      .fill();

    doc
      .fillColor('#0D0D0D') // Negro para texto del total
      .fontSize(14)
      .font('Helvetica-Bold')
      .text('TOTAL:', 360, position + 12)
      .text(`$${Number(order.totalAmount).toFixed(2)}`, 480, position + 12, { align: 'right' });
  }

  private static generateTableRow(
    doc: PDFKit.PDFDocument,
    y: number,
    item: string,
    sku: string,
    quantity: string,
    unitPrice: string,
    total: string,
    isEven: boolean = false
  ) {
    // Fondo alternado para filas
    if (isEven) {
      doc
        .rect(50, y - 2, 512, 22)
        .fillColor('#f9fafb')
        .fill();
    }

    doc
      .fillColor('#1F1F1F') // Gris oscuro para texto de productos
      .fontSize(9)
      .font('Helvetica')
      // Item
      .text(item, 60, y + 4, { width: 140, ellipsis: true })
      // SKU
      .text(sku, 210, y + 4, { width: 70 })
      // Cantidad
      .text(quantity, 290, y + 4, { width: 50, align: 'center' })
      // Precio unitario
      .text(unitPrice, 350, y + 4, { width: 70, align: 'right' })
      // Total
      .text(total, 430, y + 4, { width: 100, align: 'right' });
  }

  private static generateTotalRow(
    doc: PDFKit.PDFDocument,
    y: number,
    label: string,
    amount: string,
    color: string = '#1F1F1F' // Gris oscuro por defecto
  ) {
    doc
      .fillColor(color)
      .fontSize(10)
      .font('Helvetica')
      .text(label, 360, y)
      .text(amount, 480, y, { align: 'right' });
  }

  private static generateFooter(doc: PDFKit.PDFDocument, company: any) {
    // Verificar si estamos cerca del final de la página, si es así, agregar nueva página
    if (doc.y > 650) {
      doc.addPage();
    }

    const footerTop = Math.max(doc.y + 30, 650); // Al menos 650 de la parte superior
    
    // Línea decorativa con degradado visual (dorado)
    doc
      .rect(50, footerTop, 512, 2)
      .fillColor(company.primaryColor) // Dorado
      .fill();

    // Todo el footer en un solo bloque con colores Dark Tech
    doc
      .fillColor('#0D0D0D') // Negro carbón para agradecimiento
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('¡Gracias por su compra!', 50, footerTop + 15, { align: 'center', width: 512 })
      
      .fillColor('#1F1F1F') // Gris oscuro para instrucciones
      .fontSize(10)
      .font('Helvetica')
      .text('Si tiene alguna pregunta sobre esta factura, no dude en contactarnos.', 50, footerTop + 35, { align: 'center', width: 512 })
      
      .fillColor('#6b7280') // Gris medio para info de contacto
      .fontSize(8)
      .text(`${company.name} | ${company.phone} | ${company.email}`, 50, footerTop + 55, { align: 'center', width: 512 })
      
      .fillColor('#9ca3af') // Gris claro para metadata
      .fontSize(8)
      .text(`Página 1 de 1 | Generado el ${new Date().toLocaleDateString('es-ES')}`, 50, footerTop + 70, { align: 'center', width: 512 });
  }

  private static getStatusText(status: string): string {
    const statusMap: { [key: string]: string } = {
      'PENDING': 'Pendiente',
      'CONFIRMED': 'Confirmado',
      'PROCESSING': 'Procesando',
      'SHIPPED': 'Enviado',
      'DELIVERED': 'Entregado',
      'CANCELLED': 'Cancelado',
      'REFUNDED': 'Reembolsado'
    };
    return statusMap[status] || status;
  }

  private static getPaymentMethodText(paymentMethod: string, paymentId?: string): string {
    let methodText = '';
    
    switch (paymentMethod.toLowerCase()) {
      case 'card':
        methodText = 'Tarjeta de crédito/débito';
        break;
      case 'paypal':
        methodText = 'PayPal';
        break;
      case 'bank_transfer':
        methodText = 'Transferencia bancaria';
        break;
      case 'cash_on_delivery':
        methodText = 'Pago contra entrega';
        break;
      default:
        methodText = paymentMethod;
    }

    // Extraer últimos 4 dígitos/caracteres del ID de pago de Square
    if (paymentId && paymentMethod.toLowerCase() === 'card') {
      const last4 = paymentId.slice(-4);
      methodText += ` ****${last4}`;
    }

    return methodText;
  }
}