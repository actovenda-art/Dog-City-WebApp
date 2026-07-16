import assert from "node:assert/strict";
import {
  getResourcePermissionLevel,
  normalizeKnownPermissions,
  permissionMatches,
  setResourcePermissionLevel,
} from "../src/lib/access-permissions.js";
import { hasPageAccess } from "../src/lib/access-control.js";

assert.equal(permissionMatches("agenda:read", "agenda:read"), true);
assert.equal(permissionMatches("agenda:read", "agenda:update"), false);
assert.equal(permissionMatches("agenda:read", "agenda:*"), false);
assert.equal(permissionMatches("agenda:update", "agenda:read"), true);
assert.equal(permissionMatches("agenda:update", "agenda:update"), true);
assert.equal(permissionMatches("agenda:update", "agenda:*"), false);
assert.equal(permissionMatches("agenda:*", "agenda:read"), true);
assert.equal(permissionMatches("agenda:*", "agenda:update"), true);
assert.equal(permissionMatches("agenda:*", "agenda:*"), true);
assert.equal(permissionMatches("agenda:*", "financeiro:read"), false);
assert.equal(permissionMatches("platform:*", "financeiro:update"), true);

let permissions = setResourcePermissionLevel([], "financeiro", "read");
assert.deepEqual(permissions, ["financeiro:read"]);
assert.equal(getResourcePermissionLevel(permissions, "financeiro"), "read");

permissions = setResourcePermissionLevel(permissions, "financeiro", "update");
assert.deepEqual(permissions, ["financeiro:update"]);
assert.equal(getResourcePermissionLevel(permissions, "financeiro"), "update");

permissions = setResourcePermissionLevel(permissions, "financeiro", "all");
assert.deepEqual(permissions, ["financeiro:*"]);
assert.equal(getResourcePermissionLevel(permissions, "financeiro"), "all");

permissions = setResourcePermissionLevel(permissions, "financeiro", "none");
assert.deepEqual(permissions, []);

assert.deepEqual(
  normalizeKnownPermissions(["agenda:read", "agenda:update", "agenda:*", "invalida:*"]),
  ["agenda:*"],
);

const userWith = (...access_profile_permissions) => ({ access_profile_permissions });
assert.equal(hasPageAccess(userWith(), "Movimentacoes"), false);
assert.equal(hasPageAccess(userWith("financeiro:read"), "Movimentacoes"), true);
assert.equal(hasPageAccess(userWith("financeiro:read"), "Agendamentos"), false);
assert.equal(hasPageAccess(userWith("agenda:read"), "Agendamentos"), true);
assert.equal(hasPageAccess(userWith("agenda:read"), "Registrador"), false);
assert.equal(hasPageAccess(userWith("agenda:update"), "Registrador"), true);
assert.equal(hasPageAccess(userWith("usuarios:read"), "AdministracaoSistema"), true);
assert.equal(hasPageAccess({ is_platform_admin: true }, "Backup"), true);

console.log("Access permissions contract: ok");
