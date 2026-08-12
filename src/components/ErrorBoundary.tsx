import { Component, type ReactNode } from 'react'
import { toTelemetrySafe } from '../errors'
import { reportError, shouldSuppressAsChunkLoadTail } from '../telemetry/client'

interface ErrorBoundaryProps {
  // 'app' — full-screen recovery, for the boundary wrapping the whole tree.
  // 'pane' — a smaller in-place fallback, for a boundary scoped to one panel
  // (e.g. the scripture pane) so the rest of the app keeps working.
  variant: 'app' | 'pane'
  children: ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
}

// Catches render-time throws in its subtree. Resetting `hasError` (via retry,
// or a remount when the caller keys this on whatever data produced the
// throw) is the only recovery path.
//
// The error is reported through toTelemetrySafe(), so what leaves the device is
// a machine code, the error class and stripped stack frames — never the
// message, and never the local-only detail. See src/errors.ts for why that
// distinction is structural rather than a convention.
export default class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: unknown): void {
    // A stale-chunk failure's TypeError can escape render and land here too,
    // moments after vite:preloadError already reported it as chunk-load-error
    // — see the de-dup flag in telemetry/client.ts. Skip rather than report
    // the same underlying event a second time.
    if (shouldSuppressAsChunkLoadTail(Date.now())) return

    // `variant` is a literal union, so the boundary label is a fixed string and
    // can never be interpolated from render data. HQ fingerprints on it.
    reportError(toTelemetrySafe(error), `${this.props.variant}-boundary`)
  }

  private retry = (): void => {
    this.setState({ hasError: false })
  }

  render(): ReactNode {
    if (!this.state.hasError) return this.props.children

    if (this.props.variant === 'pane') {
      return (
        <div className="error-boundary-pane">
          <div className="error-boundary-pane-title">This passage didn't load.</div>
          <div className="error-boundary-pane-body">
            The rest of your notes are still here. You can try loading it again.
          </div>
          <button type="button" className="dialog-btn dialog-btn-primary" onClick={this.retry}>
            Try again
          </button>
        </div>
      )
    }

    return (
      <div className="error-boundary-app">
        <div className="error-boundary-app-card">
          <div className="error-boundary-app-title">Something didn't load right.</div>
          <div className="error-boundary-app-body">
            Lantern ran into a problem it couldn't recover from on its own. Notes you've already
            saved are safe. If you were partway through writing one, copy the text somewhere before
            you reload.
          </div>
          <button
            type="button"
            className="dialog-btn dialog-btn-primary"
            onClick={() => window.location.reload()}
          >
            Reload
          </button>
        </div>
      </div>
    )
  }
}
