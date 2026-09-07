// Minimal ambient type shim for multer — the official @types/multer package is
// blocked by the registry policy in this environment. This covers exactly what
// routes/classes.ts uses (memoryStorage + single-file upload with a buffer).
declare module 'multer' {
  import { RequestHandler } from 'express';

  namespace multer {
    interface File {
      fieldname: string;
      originalname: string;
      mimetype: string;
      size: number;
      buffer: Buffer;
    }
    interface StorageEngine {}
    interface Options {
      storage?: StorageEngine;
      limits?: { fileSize?: number };
    }
    interface Multer {
      single(field: string): RequestHandler;
      array(field: string, maxCount?: number): RequestHandler;
      any(): RequestHandler;
    }
  }

  interface MulterFactory {
    (options?: multer.Options): multer.Multer;
    memoryStorage(): multer.StorageEngine;
  }

  const multer: MulterFactory;
  export = multer;
}

// Augment Express.Request with the `file` property multer attaches.
declare global {
  namespace Express {
    interface Request {
      file?: import('multer').File;
      files?: import('multer').File[];
    }
  }
}
export {};
