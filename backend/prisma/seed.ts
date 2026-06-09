import bcrypt from "bcryptjs";
import { prisma } from "../src/config/prisma.js";
import { Rol } from "../src/generated/prisma/client.js";

async function main() {
  const adminPassword = await bcrypt.hash("admin123", 10);
  const carpenterPassword = await bcrypt.hash("carp123", 10);

  const admin = await prisma.usuario.upsert({
    where: { email: "admin@carpinteria.local" },
    update: {
      nombre: "Juan",
      apellido: "Administrador",
      password: adminPassword,
      rol: Rol.ADMIN
    },
    create: {
      nombre: "Juan",
      apellido: "Administrador",
      email: "admin@carpinteria.local",
      password: adminPassword,
      rol: Rol.ADMIN
    }
  });

  const carpintero = await prisma.usuario.upsert({
    where: { email: "carpintero@carpinteria.local" },
    update: {
      nombre: "Pedro",
      apellido: "Carpintero",
      password: carpenterPassword,
      rol: Rol.CARPINTERO
    },
    create: {
      nombre: "Pedro",
      apellido: "Carpintero",
      email: "carpintero@carpinteria.local",
      password: carpenterPassword,
      rol: Rol.CARPINTERO
    }
  });

  const existing = await prisma.pedido.findFirst({ where: { cliente: "Muebles Norte" } });
  if (!existing) {
    await prisma.pedido.create({
      data: {
        cliente: "Muebles Norte",
        numeroContacto: "5491123456789",
        observaciones: "Proyecto cocina melamina blanca",
        usuarioId: carpintero.id,
        detalles: {
          create: [
            {
              codigoBarra: "CB-001",
              material: "Melamina blanca 18mm",
              largo: 1200,
              ancho: 600,
              cantidad: 4,
              cantoLargo1: true,
              cantoLargo2: true,
              codigoBarraCentro: "CENTRO-001",
              remark: "Frente bajo mesada",
              numeroCliente: "1001",
              nombreCliente: "Muebles Norte",
              nombreProducto: "Cocina Linea Blanca"
            },
            {
              codigoBarra: "CB-002",
              material: "Melamina nogal 18mm",
              largo: 800,
              ancho: 450,
              cantidad: 2,
              cantoAncho1: true,
              remark: "Estantes",
              numeroCliente: "1001",
              nombreCliente: "Muebles Norte",
              nombreProducto: "Cocina Linea Blanca"
            }
          ]
        }
      }
    });
  }

  console.log({ admin: admin.email, carpintero: carpintero.email });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
