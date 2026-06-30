import type { ProjectRole, UserRole } from "@prisma/client";

const projectRoleRank: Record<ProjectRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

export function canEditProject(role: ProjectRole | "admin") {
  return role === "admin" || role === "owner" || role === "editor";
}

export function canOwnProject(role: ProjectRole | "admin") {
  return role === "admin" || role === "owner";
}

export function hasAtLeastProjectRole(role: ProjectRole | "admin", required: ProjectRole) {
  if (role === "admin") return true;
  return projectRoleRank[role] >= projectRoleRank[required];
}

export function isGlobalAdmin(role: UserRole) {
  return role === "admin";
}
