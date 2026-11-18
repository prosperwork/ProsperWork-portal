"use client";

import Link from "next/link";
import { useEffect } from "react";

export default function PortalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Portal route error:", error);
  }, [error]);

  return (
    <main
      role="alert"
      style={{
        minHeight: "65dvh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "#F6F8F6",
      }}
    >
      <section
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
        <h1 style={{ margin: "0 0 12px", fontSize: "24px", lineHeight: 1.25, color: "#182622" }}>
          We couldn&apos;t load this section
        </h1>
        <p style={{ margin: "0 0 20px", fontSize: "15px", lineHeight: 1.55, color: "#516259" }}>
          A temporary error occurred while rendering this view. Try refreshing the view or return
          to your portal overview.
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
          <Link
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
          </Link>
        </div>
      </section>
    </main>
  );
}
