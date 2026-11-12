/**
 * Graceful Shutdown Manager for Next.js Node.js Server Runtime
 * Ensures in-flight operations complete and database/external connections
 * close cleanly upon receiving SIGTERM or SIGINT signals.
 */

type ShutdownHandler = () => Promise<void> | void

class GracefulShutdownManager {
  private static instance: GracefulShutdownManager
  private handlers: ShutdownHandler[] = []
  private isShuttingDown = false

  private constructor() {}

  public static getInstance(): GracefulShutdownManager {
    if (!GracefulShutdownManager.instance) {
      GracefulShutdownManager.instance = new GracefulShutdownManager()
    }
    return GracefulShutdownManager.instance
  }

  /**
   * Register a cleanup callback to execute before process termination
   */
  public onShutdown(handler: ShutdownHandler): void {
    this.handlers.push(handler)
  }

  /**
   * Initialize process signal listeners (SIGTERM, SIGINT)
   */
  public init(): void {
    if (typeof process === 'undefined') return

    // Prevent duplicate listener registration
    if ((process as any).__gracefulShutdownRegistered) return
    ;(process as any).__gracefulShutdownRegistered = true

    const shutdown = async (signal: string) => {
      if (this.isShuttingDown) return
      this.isShuttingDown = true

      console.info(`[Server Shutdown] Received ${signal}. Starting graceful shutdown...`)

      // Safety timeout: force exit if graceful cleanup hangs
      const forceExitTimer = setTimeout(() => {
        console.error('[Server Shutdown] Graceful shutdown timed out (5s). Forcing process exit.')
        process.exit(1)
      }, 5000)

      // Unref timeout so it does not hold the event loop open if everything finishes early
      if (typeof forceExitTimer.unref === 'function') {
        forceExitTimer.unref()
      }

      try {
        // Execute registered shutdown handlers in parallel
        await Promise.allSettled(
          this.handlers.map(async (handler) => {
            try {
              await handler()
            } catch (err) {
              console.error('[Server Shutdown] Error executing cleanup handler:', err)
            }
          })
        )

        console.info('[Server Shutdown] All cleanup tasks finished successfully. Exiting clean.')
        clearTimeout(forceExitTimer)
        process.exit(0)
      } catch (error) {
        console.error('[Server Shutdown] Unexpected error during shutdown:', error)
        clearTimeout(forceExitTimer)
        process.exit(1)
      }
    }

    process.once('SIGTERM', () => shutdown('SIGTERM'))
    process.once('SIGINT', () => shutdown('SIGINT'))

    // Handle uncaught errors gracefully
    process.on('unhandledRejection', (reason) => {
      console.error('[Server Error] Unhandled Promise Rejection:', reason)
    })

    process.on('uncaughtException', (error) => {
      console.error('[Server Error] Uncaught Exception:', error)
    })
  }
}

export const shutdownManager = GracefulShutdownManager.getInstance()

export function registerGracefulShutdown(): void {
  shutdownManager.init()
}

