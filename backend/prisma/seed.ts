import bcrypt from "bcryptjs";
import { prisma } from "../src/config/prisma.js";
import { Rol } from "../src/generated/prisma/enums.js";


const seedUsers = [
  {
    email: "admin@carpinteria.local",
    nombre: "Administrador",
    apellido: "Sistema",
    telefono: "1130000000",
    password: "admin123",
    rol: Rol.ADMIN
  },
  {
    email: "carpintero@carpinteria.local",
    nombre: "Pedro",
    apellido: "Carpintero",
    telefono: "1130000001",
    password: "carp123",
    rol: Rol.CARPINTERO
  }
] as const;


async function seedUsersData() {
  for (const user of seedUsers) {
    const password = await bcrypt.hash(user.password, 10);

    await prisma.usuario.upsert({
      where: { email: user.email },
      update: {
        nombre: user.nombre,
        apellido: user.apellido,
        telefono: user.telefono,
        password,
        rol: user.rol,
        googleId: null
      },
      create: {
        nombre: user.nombre,
        apellido: user.apellido,
        email: user.email,
        telefono: user.telefono,
        password,
        rol: user.rol,
        googleId: null
      }
    });
  }
}

async function seedSettings() {
  await prisma.configuracionEmpresa.upsert({
    where: { id: "default" },
    update: {
      nombre: "ROMA",
      telefono: "",
      email: ""
    },
    create: {
      id: "default",
      nombre: "ROMA",
      telefono: "",
      email: ""
    }
  });

  await prisma.configuracionOptimizador.upsert({
    where: { id: "default" },
    update: {
      espesorSierraMm: 4.3,
      perfiladoBordeMm: 10
    },
    create: {
      id: "default",
      espesorSierraMm: 4.3,
      perfiladoBordeMm: 10
    }
  });
}



async function main() {
  console.log("[seed] Ejecutando seed...");

  await seedUsersData();
  await seedSettings();

  console.log("[seed] Seed ejecutado correctamente");
}

main()
  .catch((error) => {
    console.error("[seed] Error ejecutando seed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

