// All music analysis runs in the browser. No Python/CUDA setup or upload API.
process.env.NODE_ENV = 'production';
await import('../server/index.ts');
