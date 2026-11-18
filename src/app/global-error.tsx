"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          padding: "24px",
          background: "#F6F8F6",
          color: "#182622",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        }}
      >
        <main
          role="alert"
          style={{
            width: "100%",
            maxWidth: "480px",
            background: "#FFFFFF",
            border: "1px solid #E1E9E3",
            borderRadius: "16px",
            padding: "32px 28px",
            boxShadow: "0 12px 32px rgba(28, 63, 48, 0.08)",
          }}
        >
          <p
            style={{
              margin: "0 0 8px",
              fontSize: "12px",
              fontWeight: 700,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              color: "#135B45",
            }}
          >
            ProsperWork Music Academy
          </p>
          <h1 style={{ margin: "0 0 12px", fontSize: "24px", lineHeight: 1.25 }}>
            Something went wrong
          </h1>
          <p style={{ margin: "0 0 20px", fontSize: "15px", lineHeight: 1.55, color: "#516259" }}>
            An unexpected error interrupted this page. You can retry right away or return to the
            portal home screen.
          </p>
          {error?.digest && (
            <p style={{ margin: "0 0 20px", fontSize: "12px", color: "#516259" }}>
              Reference: <code>{error.digest}</code>
            </p>
          )}
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            <button
              type="button"
              onClick={() => reset()}
              style={{
                background: "#135B45",
                color: "#FFFFFF",
                border: "none",
                borderRadius: "10px",
                padding: "10px 18px",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Try again
            </button>
            <a
              href="/"
              style={{
                background: "#EDF6F1",
                color: "#135B45",
                border: "1px solid #CFE3D8",
                borderRadius: "10px",
                padding: "10px 18px",
                fontSize: "14px",
                fontWeight: 600,
                textDecoration: "none",
              }}
            >
              Return to portal
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
