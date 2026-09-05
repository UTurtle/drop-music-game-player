// Cross-platform production launcher: no shell-specific environment assignment.
process.env.NODE_ENV = 'production';
await import('../server/index.ts');
