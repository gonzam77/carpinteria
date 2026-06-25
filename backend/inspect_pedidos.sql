select id, cliente, "presupuestoEstimado", "costoPlacas", "costoCantos", "metrosCanto", "placasEstimadas", "faltanteStock", "fechaCreacion"
from pedidos
order by "fechaCreacion" desc
limit 10;
