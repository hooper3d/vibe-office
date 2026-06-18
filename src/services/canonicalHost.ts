type LocationLike = Pick<Location, "protocol" | "hostname" | "port" | "pathname" | "search" | "hash">;

export function getCanonicalLocalhostRedirectUrl(location: LocationLike) {
  if (location.hostname !== "localhost") return "";

  const port = location.port ? `:${location.port}` : "";
  return `${location.protocol}//127.0.0.1${port}${location.pathname}${location.search}${location.hash}`;
}
