import { Component, type ReactNode } from 'react'

type Props = {
  children: ReactNode
  onError: () => void
}

type State = { hasError: boolean }

export class ScannerErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch() {
    this.props.onError()
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}
