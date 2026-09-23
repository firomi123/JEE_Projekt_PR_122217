import type {
  LoginData,
  LoginResponse,
  MeResponse,
  RegisterData,
  RegisterResponse,
} from '@driver-docs/shared';
import type { Request, Response } from 'express';
import type { AuthService } from '../services/auth.service.js';

/** HTTP handlers of `/api/auth`. Bodies are already validated by `validateBody`. */
export class AuthController {
  /** @param service - Registration, login and current-user logic. */
  constructor(private readonly service: AuthService) {}

  /**
   * `POST /api/auth/register` – responds `201 { user }`.
   *
   * @param req - Body: validated {@link RegisterData}.
   * @param res - Receives the created user (without password).
   */
  register = async (req: Request, res: Response): Promise<void> => {
    const user = await this.service.register(req.body as RegisterData);
    req.log.info({ userId: user.id }, 'User registered');
    const body: RegisterResponse = { user };
    res.status(201).json(body);
  };

  /**
   * `POST /api/auth/login` – responds `200 { accessToken, tokenType, expiresIn, user }`.
   *
   * @param req - Body: validated {@link LoginData}.
   * @param res - Receives the access token.
   */
  login = async (req: Request, res: Response): Promise<void> => {
    const body: LoginResponse = await this.service.login(req.body as LoginData);
    req.log.info({ userId: body.user.id }, 'User logged in');
    res.json(body);
  };

  /**
   * `GET /api/auth/me` – responds `200 { user }` for the token's owner.
   *
   * @param req - Must have passed `requireAuth` (`req.user` is set).
   * @param res - Receives the current user.
   */
  me = async (req: Request, res: Response): Promise<void> => {
    const body: MeResponse = { user: await this.service.getCurrentUser(req.user!.id) };
    res.json(body);
  };
}
