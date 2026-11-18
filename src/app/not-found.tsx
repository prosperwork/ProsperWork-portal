import Link from "next/link";

export default function NotFound() {
  return (
    <main
      style={{
        minHeight: "75dvh",
        display: "grid",
        placeItems: "center",
        padding: "24px",
        background: "#F6F8F6",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "460px",
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
          404 · Page Not Found
        </p>
        <h1 style={{ margin: "0 0 12px", fontSize: "24px", lineHeight: 1.25, color: "#182622" }}>
          This portal page doesn&apos;t exist
        </h1>
        <p style={{ margin: "0 0 22px", fontSize: "15px", lineHeight: 1.55, color: "#516259" }}>
          The link may have moved or been removed. Head back to the ProsperWork Academy portal to
          continue.
        </p>
        <Link
          href="/"
          style={{
            display: "inline-flex",
            alignItems: "center",
            background: "#135B45",
            color: "#FFFFFF",
            borderRadius: "10px",
            padding: "10px 18px",
            fontSize: "14px",
            fontWeight: 600,
            textDecoration: "none",
          }}
        >
          Back to portal home
        </Link>
      </section>
    </main>
  );
}
