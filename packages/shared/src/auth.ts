import { z } from 'zod';

z.config(z.locales.pl());

/** Kontrakty API kont graczy, wspólne dla klienta i serwera. */

export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 128;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email('Nieprawidłowy adres e-mail').max(254));
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN, `Hasło musi mieć co najmniej ${PASSWORD_MIN} znaków`)
  .max(PASSWORD_MAX, `Hasło może mieć najwyżej ${PASSWORD_MAX} znaków`);
export const displayNameSchema = z
  .string()
  .trim()
  .min(2, 'Nazwa musi mieć co najmniej 2 znaki')
  .max(40, 'Nazwa może mieć najwyżej 40 znaków')
  .regex(/^[\p{L}\p{N} ._-]+$/u, 'Dozwolone są litery, cyfry, spacje oraz . _ -');

export const registerRequest = z.object({
  email: emailSchema,
  password: passwordSchema,
  displayName: displayNameSchema,
  acceptAdultContent: z.literal(true, 'Musisz potwierdzić ukończenie 18 lat'),
});
export type RegisterRequest = z.input<typeof registerRequest>;

export const loginRequest = z.object({
  email: emailSchema,
  password: z.string().min(1).max(PASSWORD_MAX),
});
export type LoginRequest = z.input<typeof loginRequest>;

export const passwordResetRequest = z.object({ email: emailSchema });
export const passwordResetConfirm = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});
export const passwordChangeRequest = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX),
  newPassword: passwordSchema,
});

export const userSettingsSchema = z.object({
  theme: z.enum(['system', 'dark', 'light']).default('dark'),
  fontScale: z.number().min(0.85).max(1.5).default(1),
  reduceMotion: z.boolean().default(false),
  /** Asystent może sam proponować pomoc, gdy gracz utknie. */
  assistantProactive: z.boolean().default(true),
  /** Tryb wyzwania: brak podpowiedzi w nowych sprawach. */
  noHintsChallenge: z.boolean().default(false),
});
export type UserSettings = z.infer<typeof userSettingsSchema>;
export const defaultUserSettings: UserSettings = userSettingsSchema.parse({});

export const updateProfileRequest = z.object({
  displayName: displayNameSchema.optional(),
  settings: userSettingsSchema.partial().optional(),
});

export const deleteAccountRequest = z.object({
  password: z.string().min(1).max(PASSWORD_MAX),
});

export interface PublicUser {
  id: string;
  email: string;
  displayName: string;
  settings: UserSettings;
  createdAt: string;
}

export interface ApiError {
  error: string;
  message: string;
  fields?: Record<string, string[]>;
}
