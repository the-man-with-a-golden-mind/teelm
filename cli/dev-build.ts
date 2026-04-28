import { spawn } from "node:child_process";
import { run as gen } from "./gen";

export async function run(mode: "dev" | "build") {
  await gen([]);

  const cmd = "npx";
  const args = mode === "dev" ? ["vite"] : ["vite", "build"];

  const proc = spawn(cmd, args, {
    stdio: "inherit",
    shell: true,
  });

  return new Promise((resolve) => {
    proc.on("exit", resolve);
  });
}
