import { DatabaseSync } from "node:sqlite";
import { newInviteCode, inviteHash } from "./security.mjs";

const databasePath = process.env.X_BRIDGE_DB || "/data/x-bridge.sqlite";
const [command] = process.argv.slice(2);
if (command !== "create-admin-invite") {
  console.error("Usage: node server/admin-cli.mjs create-admin-invite");
  process.exit(2);
}
const db = new DatabaseSync(databasePath);
const code = newInviteCode();
db.prepare(
  "INSERT INTO invites(code_hash,role,direct_limit,created_at) VALUES(?,?,?,?)",
).run(inviteHash(code), "admin", -1, Date.now());
process.stdout.write(`${code}\n`);
