import type { ProfileData, ProfileResponse } from '@driver-docs/shared';
import type { Request, Response } from 'express';
import type { ProfileService } from '../services/profile.service.js';

/** HTTP handlers of `/api/profile`. All routes require authentication (`req.user` is set). */
export class ProfileController {
  /** @param service - Profile logic. */
  constructor(private readonly service: ProfileService) {}

  /**
   * `GET /api/profile` – responds `200 { profile }` with the caller's profile.
   *
   * @param req - Authenticated request.
   * @param res - Receives the profile.
   */
  get = async (req: Request, res: Response): Promise<void> => {
    const body: ProfileResponse = { profile: await this.service.get(req.user!.id) };
    res.json(body);
  };

  /**
   * `PUT /api/profile` – replaces the caller's profile and responds `200 { profile }`.
   *
   * @param req - Authenticated request; body already validated as {@link ProfileData}.
   * @param res - Receives the updated profile.
   */
  update = async (req: Request, res: Response): Promise<void> => {
    const profile = await this.service.update(req.user!.id, req.body as ProfileData);
    req.log.info({ userId: req.user!.id }, 'Driver profile updated');
    const body: ProfileResponse = { profile };
    res.json(body);
  };
}
