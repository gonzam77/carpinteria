import bcrypt from "bcryptjs";
import { prisma } from "../src/config/prisma.js";
import { Rol, TipoMaterial } from "../src/generated/prisma/client.js";

async function main() {
  console.log("🌱 Ejecutando seed...");

  // =========================
  // Usuarios iniciales
  // =========================

  const adminPassword = await bcrypt.hash("admin123", 10);
  const carpinteroPassword = await bcrypt.hash("carp123", 10);

  await prisma.usuario.upsert({
    where: { email: "admin@carpinteria.local" },
    update: {
      nombre: "Administrador",
      apellido: "Sistema",
      password: adminPassword,
      rol: Rol.ADMIN
    },
    create: {
      nombre: "Administrador",
      apellido: "Sistema",
      email: "admin@carpinteria.local",
      password: adminPassword,
      rol: Rol.ADMIN
    }
  });

  await prisma.usuario.upsert({
    where: { email: "carpintero@carpinteria.local" },
    update: {
      nombre: "Pedro",
      apellido: "Carpintero",
      password: carpinteroPassword,
      rol: Rol.CARPINTERO
    },
    create: {
      nombre: "Pedro",
      apellido: "Carpintero",
      email: "carpintero@carpinteria.local",
      password: carpinteroPassword,
      rol: Rol.CARPINTERO
    }
  });

  // =========================
  // Configuración empresa
  // =========================

  await prisma.configuracionEmpresa.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      nombre: "ROMA",
      telefono: "",
      email: ""
    }
  });

  // =========================
  // Configuración optimizador
  // =========================

  await prisma.configuracionOptimizador.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      espesorSierraMm: 4.3,
      perfiladoBordeMm: 10
    }
  });

  // =========================
  // Materiales iniciales
  // =========================

  const materiales = [
    {
      nombre: "Melamina Blanca 18mm",
      tipo: TipoMaterial.PLACA,
      valor: 85000,
      espesorMm: 18,
      anchoPlaca: 1830,
      altoPlaca: 2750,
      stockPlacas: 20
    },
    {
      nombre: "Melamina Negra 18mm",
      tipo: TipoMaterial.PLACA,
      valor: 90000,
      espesorMm: 18,
      anchoPlaca: 1830,
      altoPlaca: 2750,
      stockPlacas: 10
    },
    {
      nombre: "Melamina Roble Dakar 18mm",
      tipo: TipoMaterial.PLACA,
      valor: 98000,
      espesorMm: 18,
      anchoPlaca: 1830,
      altoPlaca: 2750,
      stockPlacas: 8
    },
    {
      nombre: "Melamina Ceniza 18mm",
      tipo: TipoMaterial.PLACA,
      valor: 94000,
      espesorMm: 18,
      anchoPlaca: 1830,
      altoPlaca: 2750,
      stockPlacas: 12
    },
    {
      nombre: "Canto Blanco PVC 22mm",
      tipo: TipoMaterial.CANTO,
      valor: 850,
      colorCanto: "Blanco"
    },
    {
      nombre: "Canto Negro PVC 22mm",
      tipo: TipoMaterial.CANTO,
      valor: 900,
      colorCanto: "Negro"
    },
    {
      nombre: "Canto Roble Dakar PVC 22mm",
      tipo: TipoMaterial.CANTO,
      valor: 950,
      colorCanto: "Roble Dakar"
    },
    {
      nombre: "Canto Ceniza PVC 22mm",
      tipo: TipoMaterial.CANTO,
      valor: 900,
      colorCanto: "Ceniza"
    }
  ];

  for (const material of materiales) {
    await prisma.material.upsert({
      where: {
        nombre: material.nombre
      },
      update: material,
      create: material
    });
  }

  console.log("✅ Seed ejecutado correctamente");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });