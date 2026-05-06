type Props = { url?: string | null; nombre: string };

export function ProductThumb({ url, nombre }: Props) {
  if (url) return <img src={url} alt="" className="w-16 h-16 rounded object-cover" />;
  return (
    <div className="w-16 h-16 rounded bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-blue-600 font-bold">
      {nombre.slice(0, 2).toUpperCase()}
    </div>
  );
}
