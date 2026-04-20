import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/authOptions"; // your existing auth config

export type Permission = "triage:read" | "triage:write";

export async function requireAdminPermission(permission: Permission) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new AuthError("Unauthenticated");
  }

  // Assumes session.user.role and session.user.permissions exist.
  // Adjust to match your actual session shape.
  const isAdmin = session.user.role === "admin";
  const hasPermission = session.user.permissions?.includes(permission);

  if (!isAdmin || !hasPermission) {
    throw new AuthError("Forbidden: insufficient permissions");
  }

  return session.user;
}

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthError";
  }
}
