import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export class SponsorUnavailableError extends Error {
  constructor(public sponsor: string) {
    super(`Sponsor "${sponsor}" is not configured. Set its API key in .env.local.`);
    this.name = "SponsorUnavailableError";
  }
}
