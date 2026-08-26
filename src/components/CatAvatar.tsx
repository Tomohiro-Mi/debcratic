export function CatAvatar({
  icon,
  size = 44,
}: {
  icon: string;
  size?: number;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-orange-200 ring-2 ring-white"
      style={{ width: size, height: size, fontSize: size * 0.55 }}
      aria-hidden
    >
      {icon}
    </span>
  );
}
