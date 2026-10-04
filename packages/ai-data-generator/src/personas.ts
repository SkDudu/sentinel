import type { TestPersona } from "@sw/core";

export const builtinPersonas: TestPersona[] = [
  {
    id: "normal-user",
    name: "Usuário normal",
    description: "Payload válido típico",
    fields: {
      name: "João Silva",
      email: "joao@example.com",
      password: "Senha123!",
      role: "user",
    },
    tags: ["normal"],
  },
  {
    id: "invalid-user",
    name: "Usuário inválido",
    description: "Campos claramente inválidos",
    fields: {
      name: "",
      email: "joao@",
      password: "123",
      role: "invalid",
    },
    tags: ["validation"],
  },
  {
    id: "edge-user",
    name: "Usuário edge-case",
    description: "Espaços e formatação ambígua",
    fields: {
      name: " João   Silva ",
      email: " joao @example.com ",
      password: " Senha 123! ",
      role: "user",
    },
    tags: ["edge"],
  },
  {
    id: "privileged-user",
    name: "Usuário privilegiado",
    description: "Tentativa de role admin",
    fields: {
      name: "Admin Candidate",
      email: "admin.candidate@example.com",
      password: "Senha123!",
      role: "admin",
    },
    tags: ["business-logic", "privilege"],
  },
  {
    id: "international-user",
    name: "Usuário internacional",
    description: "Unicode e locale",
    fields: {
      name: "José María",
      email: "jose@example.es",
      password: "Contraseña123!",
      role: "user",
    },
    tags: ["unicode"],
  },
];
