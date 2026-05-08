import { updateScanGeo } from "./repository";

interface IpApiResponse {
  status: string;
  country: string;
  regionName: string;
  city: string;
  lat: number;
  lon: number;
}

export async function resolveAndStoreGeo(scanId: string, ip: string): Promise<void> {
  if (!ip || ip === "127.0.0.1" || ip === "::1" || ip.startsWith("192.168.") || ip.startsWith("10.")) {
    return;
  }

  const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city,lat,lon`);
  const data = (await res.json()) as IpApiResponse;

  if (data.status !== "success") return;

  await updateScanGeo(scanId, {
    country: data.country,
    region: data.regionName,
    city: data.city,
    lat: data.lat,
    lon: data.lon,
  });
}
