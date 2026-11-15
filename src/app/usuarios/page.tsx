import { redirect } from "next/navigation";
import { ensureSchemaOnce } from "@/lib/db";
import { currentUser } from "@/lib/session";
import { listUsersWithStats } from "@/lib/auth";
import { UsersAdmin } from "@/components/users-admin";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
  await ensureSchemaOnce();

  const user = await currentUser();
  if (!user) redirect("/entrar");
  if (!user.isAdmin) redirect("/");

  const users = await listUsersWithStats();

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-white">Usuarios</h1>
        <p className="mt-1 text-xs text-mist-500">
          Solo el administrador puede crear, editar o borrar cuentas. Cada usuario ve únicamente sus
          jugadas guardadas.
        </p>
      </div>

      <UsersAdmin users={users} currentUserId={user.id} />
    </div>
  );
}
