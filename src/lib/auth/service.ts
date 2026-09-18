import 'server-only';

import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2';

import { hashPassword, verifyPassword } from '@/lib/auth/password';
import { mutate, selectRows, transaction } from '@/lib/mysql/db';

interface UserCredentialRow extends RowDataPacket {
  id: string;
  email: string;
  password_hash: string;
}

interface AuthContextRow extends RowDataPacket {
  user_id: string;
  email: string;
  created_at: Date;
  email_verified_at: Date | null;
  last_sign_in_at: Date | null;
  profile_id: string;
  full_name: string;
  avatar_url: string | null;
  role: string;
  beta_features: string | string[];
  account_id: string;
  account_role: 'owner' | 'admin' | 'agent' | 'viewer';
  account_name: string;
  default_currency: string;
  crm_locale: 'pt' | 'en';
  timezone: string;
  public_url: string | null;
  navigation_layout: 'sidebar' | 'topbar';
  logo_url: string | null;
  new_feature_badges_enabled: boolean | number;
}

export async function authenticateUser(email: string, password: string) {
  const normalizedEmail = email.trim().toLowerCase();
  const rows = await selectRows<UserCredentialRow[]>(
    `SELECT id, email, password_hash
       FROM app_users
      WHERE email = ?
      LIMIT 1`,
    [normalizedEmail]
  );
  const user = rows[0];

  if (!user || !(await verifyPassword(password, user.password_hash))) {
    return null;
  }

  await mutate(
    'UPDATE app_users SET last_sign_in_at = UTC_TIMESTAMP(3) WHERE id = ?',
    [user.id]
  );
  return { id: user.id, email: user.email };
}

export async function registerOwner(input: {
  email: string;
  password: string;
  fullName: string;
  accountName?: string;
}) {
  const email = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  if (!email || !email.includes('@')) throw new Error('Invalid email address.');
  if (!fullName) throw new Error('Full name is required.');

  const accountName = input.accountName?.trim() || fullName;
  const passwordHash = await hashPassword(input.password);
  const userId = randomUUID();
  const accountId = randomUUID();
  const profileId = randomUUID();

  await transaction(async (connection) => {
    await connection.execute(
      `INSERT INTO app_users (id, email, password_hash, email_verified_at)
       VALUES (?, ?, ?, UTC_TIMESTAMP(3))`,
      [userId, email, passwordHash]
    );
    await connection.execute(
      `INSERT INTO accounts (id, name, owner_user_id)
       VALUES (?, ?, ?)`,
      [accountId, accountName, userId]
    );
    await connection.execute(
      `INSERT INTO profiles (
         id, user_id, account_id, full_name, email, account_role,
         beta_features, working_hours
       ) VALUES (?, ?, ?, ?, ?, 'owner', JSON_ARRAY(), JSON_OBJECT())`,
      [profileId, userId, accountId, fullName, email]
    );
  });

  return { id: userId, email, accountId };
}

export async function getAuthContext(userId: string) {
  const rows = await selectRows<AuthContextRow[]>(
    `SELECT
       u.id AS user_id, u.email, u.created_at, u.email_verified_at,
       u.last_sign_in_at,
       p.id AS profile_id, p.full_name, p.avatar_url, p.role,
       p.beta_features, p.account_id, p.account_role,
       a.name AS account_name, a.default_currency, a.crm_locale,
       a.timezone, a.public_url, a.navigation_layout, a.logo_url,
       a.new_feature_badges_enabled
     FROM app_users u
     JOIN profiles p ON p.user_id = u.id
     JOIN accounts a ON a.id = p.account_id
     WHERE u.id = ?
     LIMIT 1`,
    [userId]
  );
  const row = rows[0];
  if (!row) return null;

  let betaFeatures: string[] = [];
  if (Array.isArray(row.beta_features)) {
    betaFeatures = row.beta_features.filter(
      (value): value is string => typeof value === 'string'
    );
  } else if (typeof row.beta_features === 'string') {
    try {
      const parsed: unknown = JSON.parse(row.beta_features);
      if (Array.isArray(parsed)) {
        betaFeatures = parsed.filter(
          (value): value is string => typeof value === 'string'
        );
      }
    } catch {
      betaFeatures = [];
    }
  }

  return {
    user: {
      id: row.user_id,
      email: row.email,
      created_at: row.created_at,
      email_confirmed_at: row.email_verified_at,
      confirmed_at: row.email_verified_at,
      last_sign_in_at: row.last_sign_in_at,
    },
    profile: {
      id: row.profile_id,
      full_name: row.full_name,
      email: row.email,
      avatar_url: row.avatar_url,
      role: row.role,
      beta_features: betaFeatures,
      account_id: row.account_id,
      account_role: row.account_role,
    },
    account: {
      id: row.account_id,
      name: row.account_name,
      default_currency: row.default_currency,
      crm_locale: row.crm_locale,
      timezone: row.timezone,
      public_url: row.public_url,
      navigation_layout: row.navigation_layout,
      logo_url: row.logo_url,
      new_feature_badges_enabled: Boolean(row.new_feature_badges_enabled),
    },
  };
}
