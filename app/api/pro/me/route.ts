import { verifyProSessionToken, PRO_SESSION_COOKIE } from "@/lib/proSession";
import { isHostedDeployment } from "@/lib/proGate";

/** Reads the signed session cookie set by /api/pro/claim. Used by the UI to show a "Pro" badge on return visits without asking for the email again every time, and to know whether this deployment enforces the Pro gate at all (self-host never does). */
export async function GET(request: Request): Promise<Response> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const match = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${PRO_SESSION_COOKIE}=`));
  const token = match ? match.slice(PRO_SESSION_COOKIE.length + 1) : null;
  const email = verifyProSessionToken(token);
  return Response.json({ isPro: email !== null, email, hosted: isHostedDeployment() });
}
