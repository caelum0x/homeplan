import { PRO_SESSION_COOKIE, verifyProSessionToken } from "./proSession";
import { getProSubscriber } from "./entitlements";

// Enforces the Pro gate only on the hosted deployment (DATABASE_URL configured).
// A self-hosted instance never sets DATABASE_URL for this purpose today, so it
// stays fully free and fully featured by design — isProRequest short-circuits
// to true before touching the database in that case.

/** True only when this process is the owner's hosted deployment, never on a self-host clone without a database configured. */
export function isHostedDeployment(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

function readProSessionToken(request: Request): string | null {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PRO_SESSION_COOKIE}=`));
  return match ? match.slice(PRO_SESSION_COOKIE.length + 1) : null;
}

/** Self-host: always true. Hosted: true only for a verified session backed by a real entitled pro_subscribers row. */
export async function isProRequest(request: Request): Promise<boolean> {
  if (!isHostedDeployment()) return true;
  const email = verifyProSessionToken(readProSessionToken(request));
  if (!email) return false;
  const subscriber = await getProSubscriber(email);
  return subscriber?.isEntitled ?? false;
}

export const PRO_REQUIRED_BODY = {
  error: "pro_required",
  message:
    "PDF and DXF export are part of HomePlan Pro on this hosted site ($49/mo). Self-host HomePlan (MIT, free) for unlimited export instead, or claim Pro if you've already subscribed.",
} as const;
