import type { LoginData, LoginResponse, RegisterData, UserDto } from '@driver-docs/shared';
import type { User } from '../generated/prisma/client.js';
import { ConflictError, UnauthorizedError, type FieldIssue } from '../errors/app-error.js';
import { hashPassword, verifyAgainstDummy, verifyPassword } from '../lib/password.js';
import { DuplicateUserError, type UserRepository } from '../repositories/user.repository.js';
import type { TokenService } from './token.service.js';

/** Polish messages shown next to the form field that is already taken. */
const TAKEN_MESSAGES: Record<'username' | 'email', string> = {
  username: 'Ten login jest już zajęty',
  email: 'Konto z tym adresem e-mail już istnieje',
};

/**
 * Converts a user row into the public DTO (drops the password hash).
 *
 * @param user - Database row.
 * @returns `{ id, username, email, role, createdAt }` with an ISO timestamp.
 */
export function toUserDto(user: User): UserDto {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt.toISOString(),
  };
}

/**
 * Builds the 409 error for taken fields.
 *
 * @param fields - Taken fields in display order.
 * @returns A ConflictError with one Polish field message per taken field.
 */
function takenFieldsError(fields: ('username' | 'email')[]): ConflictError {
  const issues: FieldIssue[] = fields.map((path) => ({ path, message: TAKEN_MESSAGES[path] }));
  return new ConflictError(issues, 'Username or e-mail is already registered');
}

/** Registration, login and current-user logic. */
export class AuthService {
  /**
   * @param users - User data access.
   * @param tokens - Issues access tokens.
   */
  constructor(
    private readonly users: UserRepository,
    private readonly tokens: TokenService,
  ) {}

  /**
   * Registers a new account.
   *
   * @param data - Validated and normalized registration data (lowercase username/e-mail).
   * @returns The created user as a DTO.
   * Side effects: writes one row to `users` with an argon2id hash of the password.
   * @throws {ConflictError} 409 when the username and/or e-mail is already registered,
   *   with one entry per taken field in `details`.
   */
  async register(data: RegisterData): Promise<UserDto> {
    const taken = await this.users.findTakenFields(data.username, data.email);
    if (taken.length > 0) throw takenFieldsError(taken);

    const passwordHash = await hashPassword(data.password);
    try {
      const user = await this.users.create({
        username: data.username,
        email: data.email,
        passwordHash,
      });
      return toUserDto(user);
    } catch (error) {
      // Lost a race with a concurrent registration of the same username/e-mail.
      if (error instanceof DuplicateUserError) throw takenFieldsError(error.fields);
      throw error;
    }
  }

  /**
   * Checks credentials and issues an access token.
   *
   * An unknown username and a wrong password produce the same error, and an unknown
   * username still costs one argon2 verification, so neither the response nor its
   * timing reveals whether an account exists.
   *
   * @param data - Validated login data (lowercase username).
   * @returns The token, its type and lifetime, and the user.
   * @throws {UnauthorizedError} 401 `INVALID_CREDENTIALS` for bad credentials.
   */
  async login(data: LoginData): Promise<LoginResponse> {
    const user = await this.users.findByUsername(data.username);
    const valid = user
      ? await verifyPassword(user.passwordHash, data.password)
      : (await verifyAgainstDummy(data.password), false);
    if (!user || !valid) {
      throw new UnauthorizedError('Invalid username or password', 'INVALID_CREDENTIALS');
    }
    const { token, expiresIn } = await this.tokens.issue(user.id);
    return { accessToken: token, tokenType: 'Bearer', expiresIn, user: toUserDto(user) };
  }

  /**
   * Loads the account of an authenticated request.
   *
   * @param userId - The `sub` of a verified access token.
   * @returns The user as a DTO.
   * @throws {UnauthorizedError} 401 `UNAUTHORIZED` if the account no longer exists.
   */
  async getCurrentUser(userId: string): Promise<UserDto> {
    const user = await this.users.findById(userId);
    if (!user) throw new UnauthorizedError('Account no longer exists');
    return toUserDto(user);
  }
}
