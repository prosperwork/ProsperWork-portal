export default function BrandEmblem({ className }: { className: string }) {
  return (
    <img
      className={className}
      src="/images/logo/brand-emblem.webp"
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}
