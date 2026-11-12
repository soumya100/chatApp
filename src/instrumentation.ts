/**
 * Next.js Instrumentation Hook
 * Invoked once at server startup in Node.js runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerGracefulShutdown } = await import('@/lib/shutdown')
    registerGracefulShutdown()
    console.info('[Server] Graceful shutdown lifecycle hooks registered successfully.')
  }
}

