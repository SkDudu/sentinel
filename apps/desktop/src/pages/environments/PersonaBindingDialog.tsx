import { useEffect, useState, type FormEvent } from "react";
import { AuthType } from "@sw/core";
import { api, type EnvironmentDto, type EnvironmentPersonaDto } from "@/services/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { toast } from "@/components/ui/toast";

const AUTH_ITEMS = [
  AuthType.NONE,
  AuthType.BEARER,
  AuthType.BASIC,
  AuthType.API_KEY,
  AuthType.COOKIE,
  AuthType.LOGIN_RECIPE,
].map((value) => ({ label: value, value }));

const textareaClass =
  "mt-1.5 w-full rounded-lg border border-input bg-transparent px-2.5 py-2 font-mono text-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

function parseFixtures(raw: string): Record<string, string> {
  const trimmed = raw.trim();
  if (!trimmed) return {};
  const parsed: unknown = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error('Fixtures deve ser um objeto JSON, ex: {"userId":"42"}');
  }
  return Object.fromEntries(
    Object.entries(parsed).map(([key, value]) => [key, String(value)]),
  );
}

export function PersonaBindingDialog({
  environment,
  item,
  onOpenChange,
  onSaved,
}: {
  environment: EnvironmentDto;
  item: EnvironmentPersonaDto | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [role, setRole] = useState("");
  const [authType, setAuthType] = useState<string>(AuthType.NONE);
  const [fixturesJson, setFixturesJson] = useState("");
  const [token, setToken] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!item) return;
    setRole(item.persona.role ?? "");
    setAuthType(item.binding?.authType ?? AuthType.NONE);
    setFixturesJson(
      item.binding && Object.keys(item.binding.fixtures).length > 0
        ? JSON.stringify(item.binding.fixtures, null, 2)
        : "",
    );
    setToken("");
    setUsername("");
    setPassword("");
  }, [item]);

  function secretValue(): string | null {
    if (authType === AuthType.NONE) return null;
    if (authType === AuthType.BASIC) {
      if (!username.trim() && !password) return null;
      if (!username.trim() || !password) {
        throw new Error("Basic auth precisa de usuário e senha");
      }
      return `${username.trim()}:${password}`;
    }
    if (authType === AuthType.LOGIN_RECIPE) {
      if (!username.trim() && !password) return null;
      return JSON.stringify({ username: username.trim(), password });
    }
    return token.trim() || null;
  }

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!item) return;
    setBusy(true);
    try {
      const fixtures = parseFixtures(fixturesJson);
      const secret = secretValue();
      if ((item.persona.role ?? "") !== role.trim()) {
        await api.updatePersona(environment.projectId, item.persona.id, {
          name: item.persona.name,
          description: item.persona.description,
          fields: item.persona.fields,
          tags: item.persona.tags,
          role: role.trim(),
        });
      }
      await api.savePersonaBinding(environment.id, item.persona.id, {
        authType,
        fixtures,
      });
      if (secret) {
        await api.setPersonaSecret(environment.id, item.persona.id, secret);
      }
      toast.add({ title: "Persona configurada.", type: "success" });
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.add({
        title: "Algo deu errado",
        description: err instanceof Error ? err.message : "Falha ao salvar",
        type: "error",
      });
    } finally {
      setBusy(false);
    }
  }

  const needsUserPass =
    authType === AuthType.BASIC || authType === AuthType.LOGIN_RECIPE;

  return (
    <Dialog open={item !== null} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{item?.persona.name ?? "Persona"} — {environment.name}</DialogTitle>
          <DialogDescription>
            Credencial vai para o vault; fixtures são ids de recursos que esta
            persona possui neste ambiente.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void onSubmit(event)} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              Role
              <Input
                value={role}
                placeholder="user, admin, support…"
                onChange={(event) => setRole(event.target.value)}
                className="mt-1.5"
              />
            </label>
            <label className="block text-sm">
              Auth
              <Select
                items={AUTH_ITEMS}
                value={authType}
                onValueChange={(value) => {
                  if (value != null) setAuthType(value);
                }}
              >
                <SelectTrigger className="mt-1.5 w-full">
                  <SelectValue placeholder="Auth" />
                </SelectTrigger>
                <SelectContent portalled={false}>
                  <SelectGroup>
                    {AUTH_ITEMS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </label>
          </div>

          {authType === AuthType.LOGIN_RECIPE && !environment.loginRecipe ? (
            <p className="text-xs text-destructive">
              Ambiente sem receita de login — grave uma em Editar.
            </p>
          ) : null}

          {needsUserPass ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                Usuário
                <Input
                  autoComplete="off"
                  value={username}
                  placeholder={item?.secretConfigured ? "•••• (manter)" : ""}
                  onChange={(event) => setUsername(event.target.value)}
                  className="mt-1.5 font-mono text-xs"
                />
              </label>
              <label className="block text-sm">
                Senha
                <Input
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  placeholder={item?.secretConfigured ? "•••• (manter)" : ""}
                  onChange={(event) => setPassword(event.target.value)}
                  className="mt-1.5 font-mono text-xs"
                />
              </label>
            </div>
          ) : authType !== AuthType.NONE ? (
            <label className="block text-sm">
              Token / API key / Cookie
              <Input
                type="password"
                value={token}
                placeholder={item?.secretConfigured ? "•••• (manter)" : ""}
                onChange={(event) => setToken(event.target.value)}
                className="mt-1.5 font-mono text-xs"
              />
            </label>
          ) : null}

          <label className="block text-sm">
            Fixtures (JSON)
            <textarea
              rows={4}
              value={fixturesJson}
              placeholder={'{\n  "userId": "42",\n  "orderId": "ord_9"\n}'}
              onChange={(event) => setFixturesJson(event.target.value)}
              className={textareaClass}
            />
          </label>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              {busy ? <Spinner data-icon="inline-start" /> : null}
              Salvar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
