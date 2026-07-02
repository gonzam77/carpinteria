import bcrypt from "bcryptjs";
import { prisma } from "../src/config/prisma.js";
import { Rol, TipoMaterial } from "../src/generated/prisma/enums.js";

type SeedPlateMaterial = {
  nombre: string;
  tipo: typeof TipoMaterial.PLACA;
  valor: number;
  valorManoObra: number;
  espesorMm: number;
  anchoPlaca: number;
  altoPlaca: number;
  stockPlacas: number;
  colorCanto: null;
  placaMaterialId: null;
  activo: boolean;
};

type SeedEdgeMaterial = {
  nombre: string;
  tipo: typeof TipoMaterial.CANTO;
  valor: number;
  valorManoObra: number;
  espesorMm: number;
  colorCanto: string;
  placaNombre: string;
  anchoPlaca: null;
  altoPlaca: null;
  stockPlacas: null;
  activo: boolean;
};

type SeedMaterial = SeedPlateMaterial | SeedEdgeMaterial;

const adminUser = {
  email: "admin@carpinteria.local",
  nombre: "Administrador",
  apellido: "Sistema",
  telefono: "1130000000",
  password: "admin123",
  rol: Rol.ADMIN
} as const;

const seedMaterials: SeedMaterial[] = [
  {
    nombre: "Melamina Blanca 18mm",
    tipo: TipoMaterial.PLACA,
    valor: 85000,
    valorManoObra: 0,
    espesorMm: 18,
    anchoPlaca: 1830,
    altoPlaca: 2750,
    stockPlacas: 20,
    colorCanto: null,
    placaMaterialId: null,
    activo: true
  },
  {
    nombre: "Melamina Negra 18mm",
    tipo: TipoMaterial.PLACA,
    valor: 90000,
    valorManoObra: 0,
    espesorMm: 18,
    anchoPlaca: 1830,
    altoPlaca: 2750,
    stockPlacas: 10,
    colorCanto: null,
    placaMaterialId: null,
    activo: true
  },
  {
    nombre: "Melamina Roble Dakar 18mm",
    tipo: TipoMaterial.PLACA,
    valor: 98000,
    valorManoObra: 0,
    espesorMm: 18,
    anchoPlaca: 1830,
    altoPlaca: 2750,
    stockPlacas: 8,
    colorCanto: null,
    placaMaterialId: null,
    activo: true
  },
  {
    nombre: "Canto Blanco PVC 22mm",
    tipo: TipoMaterial.CANTO,
    valor: 850,
    valorManoObra: 0,
    espesorMm: 0.4,
    colorCanto: "Blanco",
    placaNombre: "Melamina Blanca 18mm",
    anchoPlaca: null,
    altoPlaca: null,
    stockPlacas: null,
    activo: true
  },
  {
    nombre: "Canto Negro PVC 22mm",
    tipo: TipoMaterial.CANTO,
    valor: 900,
    valorManoObra: 0,
    espesorMm: 0.4,
    colorCanto: "Negro",
    placaNombre: "Melamina Negra 18mm",
    anchoPlaca: null,
    altoPlaca: null,
    stockPlacas: null,
    activo: true
  },
  {
    nombre: "Canto Roble Dakar PVC 22mm",
    tipo: TipoMaterial.CANTO,
    valor: 950,
    valorManoObra: 0,
    espesorMm: 0.4,
    colorCanto: "Roble Dakar",
    placaNombre: "Melamina Roble Dakar 18mm",
    anchoPlaca: null,
    altoPlaca: null,
    stockPlacas: null,
    activo: true
  }
];

async function seedAdminUser() {
  const passwordHash = await bcrypt.hash(adminUser.password, 10);

  await prisma.usuario.upsert({
    where: { email: adminUser.email },
    update: {
      nombre: adminUser.nombre,
      apellido: adminUser.apellido,
      telefono: adminUser.telefono,
      password: passwordHash,
      rol: adminUser.rol,
      googleId: null
    },
    create: {
      nombre: adminUser.nombre,
      apellido: adminUser.apellido,
      email: adminUser.email,
      telefono: adminUser.telefono,
      password: passwordHash,
      rol: adminUser.rol,
      googleId: null
    }
  });
}

async function seedCompanySettings() {
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
}

async function seedOptimizerSettings() {
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
  const platesByName = new Map<string, string>();
  for (const material of seedMaterials.filter((item): item is SeedPlateMaterial => item.tipo === TipoMaterial.PLACA)) {
    const plate = await prisma.material.upsert({
      where: { nombre: material.nombre },
      update: material,
      create: material
    });
    platesByName.set(plate.nombre, plate.id);
  }

  for (const material of seedMaterials.filter((item): item is SeedEdgeMaterial => item.tipo === TipoMaterial.CANTO)) {
    const { placaNombre, ...canto } = material;
    const placaMaterialId = platesByName.get(placaNombre) ?? null;
    await prisma.material.upsert({
      where: { nombre: canto.nombre },
      update: { ...canto, placaMaterialId },
      create: { ...canto, placaMaterialId }
    });
  }
}

async function main() {
  console.log("[seed] Iniciando carga de datos base...");

  await seedAdminUser();
  await seedCompanySettings();
  await seedOptimizerSettings();
  await seedMaterialsData();

  console.log("[seed] Seed completado correctamente.");
}

main()
  .catch((error) => {
    console.error("[seed] Error al ejecutar el seed", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
