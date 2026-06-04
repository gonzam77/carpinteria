import { Rol } from "../generated/prisma/client.js";

declare global {
  namespace Express {
    interface User {
      id: string;
      rol: Rol;
      email: string;
    }

    interface Request {
      user?: User;
    }
  }
}
