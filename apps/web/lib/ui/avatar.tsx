import Image from "next/image";
import { cn } from "@/lib/utils";
import { getInitials } from "../utils";

type AvatarProps = {
  name: string;
  imageUrl?: string | null;
  size?: number;
  borderColor?: string;
  className?: string;
};

export function Avatar({
  name,
  imageUrl,
  size = 48,
  borderColor = "var(--goberna-blue-500)",
  className,
}: AvatarProps) {
  return (
    <div
      className={cn("rounded-full overflow-hidden shrink-0 bg-goberna-blue-100 relative", className)}
      style={{ width: size, height: size, border: `2px solid ${borderColor}` }}
    >
      {imageUrl ? (
        <Image src={imageUrl} alt={name} fill className="object-cover" unoptimized />
      ) : (
        <div
          className="w-full h-full flex items-center justify-center font-extrabold"
          style={{ fontSize: size * 0.375, color: borderColor }}
        >
          {getInitials(name, 1)}
        </div>
      )}
    </div>
  );
}
