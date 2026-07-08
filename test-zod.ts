import { z } from "zod";
console.log(z.coerce.number().min(1).max(50).optional().safeParse(undefined));
