/* eslint-disable @next/next/no-img-element */
export function CatAvatar({
  icon,
  iconUrl,
  size = 44,
}: {
  icon: string;
  iconUrl?: string | null;
  size?: number;
}) {
  const imageSrc = iconUrl ?? (/^https?:\/\//i.test(icon) ? icon : null);
  const fallbackIcon = imageSrc ? "🐱" : icon;
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-100 to-orange-200 ring-2 ring-white"
      style={{ width: size, height: size, fontSize: size * 0.55 }}
      aria-hidden={!imageSrc}
    >
      {imageSrc ? (
        <img
          src={imageSrc}
          alt=""
          width={size}
          height={size}
          className="h-full w-full rounded-full object-cover"
          loading="lazy"
        />
      ) : (
        fallbackIcon
      )}
    </span>
  );
}
