/**
 * @fileOverview User repository.
 * All Prisma queries for the users table.
 * User.id = Supabase auth.users.id (UUID — not auto-generated here).
 */

import { db } from "@/lib/db";
import type { User, UserRole } from "@prisma/client";

export type CreateUserInput = {
  id: string;          // Supabase auth UID
  email: string;
  displayName?: string;
  role?: UserRole;
  organizationId: string;
};

export type UpdateUserInput = {
  displayName?: string;
  role?: UserRole;
  isActive?: boolean;
  lastLoginAt?: Date;
};

export const UserRepository = {
  async create(data: CreateUserInput): Promise<User> {
    return db.user.create({ data });
  },

  /**
   * Upsert — called on every login to ensure the user row exists
   * and last login time is updated.
   */
  async upsertOnLogin(data: CreateUserInput): Promise<User> {
    return db.user.upsert({
      where: { id: data.id },
      create: data,
      update: { lastLoginAt: new Date(), isActive: true },
    });
  },

  async findById(id: string): Promise<User | null> {
    return db.user.findUnique({ where: { id } });
  },

  async findByEmail(email: string): Promise<User | null> {
    return db.user.findUnique({ where: { email } });
  },

  async findByOrg(organizationId: string): Promise<User[]> {
    return db.user.findMany({
      where: { organizationId, isActive: true },
      orderBy: { createdAt: "asc" },
    });
  },

  async update(id: string, data: UpdateUserInput): Promise<User> {
    return db.user.update({ where: { id }, data });
  },

  async countByOrg(organizationId: string): Promise<number> {
    return db.user.count({ where: { organizationId, isActive: true } });
  },
};
