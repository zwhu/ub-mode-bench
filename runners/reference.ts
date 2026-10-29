import { z } from "zod";

const Copies = z.array(z.object({ name: z.string(), version: z.string() }));

export function assertDependencyBaselines(copies: unknown, expected: Record<string, string>): void {
  for (const copy of Copies.parse(copies)) {
    if (expected[copy.name] && copy.version !== expected[copy.name]) {
      throw new Error(`REFERENCE_ISOLATION_BLOCKED: ${copy.name}@${copy.version}, expected pre-fix ${expected[copy.name]}`);
    }
  }
}

export const dependencyProbeCode = `
const fs = require("fs");
const root = "/opt/task/node_modules/.pnpm/";
if (!fs.existsSync(root)) throw new Error("REFERENCE_ISOLATION_BLOCKED: dependency tree missing");
const names = JSON.parse(process.argv[1]);
const copies = [];
for (const directory of fs.readdirSync(root)) {
  for (const name of names) {
    if (!directory.startsWith(name + "@")) continue;
    const path = root + directory + "/node_modules/" + name + "/package.json";
    const metadata = JSON.parse(fs.readFileSync(path, "utf8"));
    copies.push({name, version: metadata.version});
  }
}
console.log(JSON.stringify(copies));
`;
