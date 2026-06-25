export function withToken(url) {
  if (!url) return url;
  try {
    const raw = localStorage.getItem("token");
    if (!raw) return url;
    const token = JSON.parse(raw);
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}token=${token}`;
  } catch {
    return url;
  }
}
