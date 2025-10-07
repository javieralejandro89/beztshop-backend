// src/middleware/errorHandler.ts
import { Request, Response, NextFunction } from 'express';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error('Error:', err);

  // Errores de validación de Zod
  if (err.issues) {
    return res.status(400).json({
      error: 'Datos inválidos',
      details: err.issues
    });
  }

  // Error por defecto
  res.status(500).json({
    error: 'Error interno del servidor'
  });
};

export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
};