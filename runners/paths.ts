export function fileKind(path: string): "code" | "test" | "other" {
  if (/(^|\/)(test|tests|__tests__)\//.test(path)) return "test";
  return /(^|\/)src\//.test(path) ? "code" : "other";
}

export function allowedPath(path: string, allowed: string[]): boolean {
  return allowed.some(pattern => pattern.endsWith("/**") ? path.startsWith(pattern.slice(0, -2)) : path === pattern);
}
