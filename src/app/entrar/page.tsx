import { LoginForm } from "@/components/login-form";

export const dynamic = "force-dynamic";

export default function EntrarPage() {
  return (
    <div className="mx-auto max-w-sm pt-10 sm:pt-16">
      <div className="card space-y-5 p-6">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-white">Entrar</h1>
          <p className="mt-1 text-xs text-mist-400">
            Acceso privado. Usa la cuenta que te dio el administrador.
          </p>
        </div>

        <LoginForm />

        <p className="text-[11px] leading-relaxed text-mist-500">
          ¿No tienes cuenta? Pídesela al administrador. El registro está cerrado.
        </p>
      </div>
    </div>
  );
}
