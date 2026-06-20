import React from "react";

/* Catches render/runtime errors in its subtree so one failure (e.g. a lost
 * WebGL context in the 3D/globe views) no longer blanks the whole app.
 * Pass `fallback={(error, reset) => <…/>}` for a custom UI, or rely on the
 * default dark-themed message + reset button. */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error("MyFam — caught render error:", error, info);
  }

  reset = () => this.setState({ error: null });

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);
    return (
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "grid",
          placeItems: "center",
          background: "#070F0C",
          color: "#8AA398",
          fontFamily: "'Inter',system-ui,-apple-system,sans-serif",
          padding: 24,
          textAlign: "center",
          zIndex: 200,
        }}
      >
        <div>
          <div style={{ fontSize: 18, color: "#EAF2ED", marginBottom: 8 }}>
            Something went wrong
          </div>
          <div style={{ fontSize: 13, marginBottom: 16 }}>
            The view hit an unexpected error.
          </div>
          <button
            onClick={this.reset}
            style={{
              border: "none",
              background: "#3FB985",
              color: "#06140F",
              borderRadius: 999,
              padding: "8px 16px",
              fontSize: 13.5,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      </div>
    );
  }
}
