import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LeagueRedirect({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const league = code.toUpperCase();
  redirect(`/?liga=${league}&dia=todos#liga-${league}`);
}
