import bcrypt from "bcryptjs";
import { prisma } from "../src/config/prisma.js";
import { Rol, TipoMaterial } from "../src/generated/prisma/client.js";

type SeedMaterial =
  | {
      nombre: string;
      tipo: TipoMaterial.PLACA;
      valor: number;
      espesorMm: number;
      anchoPlaca: number;
      altoPlaca: number;
      stockPlacas: number;
      colorCanto: null;
      activo: boolean;
    }
  | {
      nombre: string;
      tipo: TipoMaterial.CANTO;
      valor: number;
      espesorMm: number;
      colorCanto: string;
      anchoPlaca: null;
      altoPlaca: null;
      stockPlacas: null;
      activo: boolean;
    };

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

const seedMaterials: SeedMaterial[] = [
  {
    nombre: "Melamina Blanca 18mm",
    tipo: TipoMaterial.PLACA,
    valor: 85000,
    espesorMm: 18,
    anchoPlaca: 1830,
    altoPlaca: 2750,
    stockPlacas: 20,
    colorCanto: null,
    activo: true
  },
  {
    nombre: "Melamina Negra 18mm",
    tipo: TipoMaterial.PLACA,
    valor: 90000,
    espesorMm: 18,
    anchoPlaca: 1830,
    altoPlaca: 2750,
    stockPlacas: 10,
    colorCanto: null,
    activo: true
  },
  {
    nombre: "Melamina Roble Dakar 18mm",
    tipo: TipoMaterial.PLACA,
    valor: 98000,
    espesorMm: 18,
    anchoPlaca: 1830,
    altoPlaca: 2750,
    stockPlacas: 8,
    colorCanto: null,
    activo: true
  },
  {
    nombre: "Melamina Ceniza 18mm",
    tipo: TipoMaterial.PLACA,
    valor: 94000,
    espesorMm: 18,
    anchoPlaca: 1830,
    altoPlaca: 2750,
    stockPlacas: 12,
    colorCanto: null,
    activo: true
  },
  {
    nombre: "Canto Blanco PVC 22mm",
    tipo: TipoMaterial.CANTO,
    valor: 850,
    espesorMm: 0.4,
    colorCanto: "Blanco",
    anchoPlaca: null,
    altoPlaca: null,
    stockPlacas: null,
    activo: true
  },
  {
    nombre: "Canto Negro PVC 22mm",
    tipo: TipoMaterial.CANTO,
    valor: 900,
    espesorMm: 0.4,
    colorCanto: "Negro",
    anchoPlaca: null,
    altoPlaca: null,
    stockPlacas: null,
    activo: true
  },
  {
    nombre: "Canto Roble Dakar PVC 22mm",
    tipo: TipoMaterial.CANTO,
    valor: 950,
    espesorMm: 0.4,
    colorCanto: "Roble Dakar",
    anchoPlaca: null,
    altoPlaca: null,
    stockPlacas: null,
    activo: true
  },
  {
    nombre: "Canto Ceniza PVC 22mm",
    tipo: TipoMaterial.CANTO,
    valor: 900,
    espesorMm: 0.4,
    colorCanto: "Ceniza",
    anchoPlaca: null,
    altoPlaca: null,
    stockPlacas: null,
    activo: true
  }
];

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

async function seedMaterialsData() {
  for (const material of seedMaterials) {
    await prisma.material.upsert({
      where: { nombre: material.nombre },
      update: material,
      create: material
    });
  }
}

async function main() {
  console.log("[seed] Ejecutando seed...");

  await seedUsersData();
  await seedSettings();
  await seedMaterialsData();

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
